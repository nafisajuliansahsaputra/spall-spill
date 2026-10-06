import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createProductClickConfirmationBundle } from "./product-click-bundle";
import { createProductClickHttpBoundary } from "./product-click-http";
import { PublishedProductConfirmationActions } from "./product-confirmation-actions";
import type { ProductClickIntentRecord } from "./product-click-intent";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const locator = { handle: "creator", spill_reference: 27 };
const product = { status: "success", current_handle: "creator", display_name: "Published Creator", spill_reference: 27,
  title: "Published Product", primary_image_path: "/media/product/creator/27", destinations: [
    { provider_key: "shopee", available: true, destination_url: "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB" },
    { provider_key: "tokopedia", available: true, destination_url: "https://tokopedia.com/item?affiliate=creator" },
  ] };
function context(provider: string) {
  return { status: "success", confirmation: structuredClone(product), binding: { ...locator, provider_key: provider,
    publication_token: "a".repeat(64), destination_hash: hash(product.destinations.find(d => d.provider_key === provider)!.destination_url) } };
}
function fixture() {
  const records = new Map<string, ProductClickIntentRecord>();
  const contexts = new Map<string, unknown>(); const denied = new Set<string>(); const failedCreate = new Set<string>();
  let projection: unknown = product; let upper = 100010;
  const readClock = vi.fn(async () => ({ lowerNow: () => 100000, upperNow: () => upper }));
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const name = String(input).split("/").at(-1)!; const body = JSON.parse(String(init?.body ?? "{}")); calls.push({ name, body });
    expect(new Headers(init?.headers).get("content-profile")).toBe("api");
    let data: unknown = null;
    if (name === "resolve_public_product") data = projection;
    if (name === "resolve_published_product_click_context_server") data = contexts.has(String(body.input_provider_key))
      ? contexts.get(String(body.input_provider_key)) : context(String(body.input_provider_key));
    if (name === "read_product_click_clock_server") data = 100000 + Math.floor(performance.now());
    if (name === "resolve_published_product_destination_server" || name === "resolve_product_click_intent_destination_server") {
      const provider = String(name === "resolve_product_click_intent_destination_server"
        ? (body.input_record as ProductClickIntentRecord).binding.provider_key : body.input_provider_key);
      data = denied.has(provider) ? { status: "unavailable" }
        : { status: "success", destination_url: product.destinations.find(d => d.provider_key === provider)!.destination_url };
    }
    if (name === "create_product_click_intent_server") {
      const record = body.input_record as ProductClickIntentRecord; data = !failedCreate.has(record.binding.provider_key);
      if (data) records.set(String(body.input_token_hash), record);
    }
    if (name === "consume_product_click_intent_server") { data = records.get(String(body.input_token_hash)) ?? null; records.delete(String(body.input_token_hash)); }
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://bundle-fixture.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  return { client, bundle: createProductClickConfirmationBundle(client, readClock), readClock, fetch, records, calls, contexts,
    denied, failedCreate, projection: (value: unknown) => { projection = value; }, time: (value: number) => { upper = value; } };
}
describe("private snapshot-bound Product confirmation bundle", () => {
  it("uses actual SDK snapshot contexts, one calibration and identical confirmation hash for all records", async () => {
    const f = fixture(); const result = await f.bundle(locator); expect(result?.confirmation).toEqual(product);
    expect(result?.intents.map(i => i.provider_key)).toEqual(["shopee", "tokopedia"]); expect(f.readClock).toHaveBeenCalledTimes(1);
    expect(new Set(result!.intents.map(i => i.token)).size).toBe(2); expect(f.records.size).toBe(2);
    for (const record of f.records.values()) { expect(record.confirmation_hash).toBe(hash(JSON.stringify(result!.confirmation)));
      expect(record.binding.publication_token).toBe("a".repeat(64)); expect(record.expires_at-record.issued_at).toBe(120000); }
    expect(JSON.stringify(result)).not.toContain("publication_token"); expect(JSON.stringify(result)).not.toContain("destination_hash");
    expect(f.calls.slice(0,3).map(c => c.name)).toEqual(["resolve_public_product", "resolve_published_product_click_context_server", "resolve_published_product_click_context_server"]);
  });
  it("hands actual calibrated SDK bundle through SSR forms to independent native redemption and replay denial", async () => {
    const f = fixture(); const http = createProductClickHttpBoundary({ client: f.client, origin: "https://app.example.test", permit: async () => true });
    const response = await http.issueBundle(new Request("https://app.example.test/staged-bundle", { method: "POST",
      headers: { origin: "https://app.example.test", "content-type": "application/json" }, body: JSON.stringify(locator) }));
    expect(response.status).toBe(200); expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const result = await response.json(); expect(result.intents).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("publication_token");
    const html = renderToStaticMarkup(createElement(PublishedProductConfirmationActions, { payload: result }));
    expect(html).toContain("Choose marketplace"); expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<form"));
    for (const [index, form] of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g).toArray().entries()) {
      const fields = [...form[1]!.matchAll(/name="([^"]+)" value="([^"]+)"/g)].map(m => [m[1]!,m[2]!] as [string,string]);
      const request = () => new Request("https://app.example.test/actions/product-click", { method: "POST", headers: {
        origin: "https://app.example.test", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields) });
      const response = await http.redeemForm(request()); expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(product.destinations[index]!.destination_url);
      expect((await http.redeemForm(request())).status).toBe(403);
    }
    expect(f.records.size).toBe(0);
  });
  it.each([null, {}, { ...locator, provider_key: "shopee" }, { ...locator, confirmation: product },
    { ...locator, publication_token: "a".repeat(64) }, { ...locator, destination_url: "https://evil.test" }, { ...locator, spill_reference: "27" },
  ])("rejects caller authority/nonlocator %j before RPC", async input => { const f=fixture(); expect(await f.bundle(input)).toBeNull(); expect(f.fetch).not.toHaveBeenCalled(); });
  it("canonicalizes protected alias only through trusted projection", async () => {
    const f=fixture(); expect((await f.bundle({ ...locator, handle: "OLD-HANDLE" }))?.confirmation.current_handle).toBe("creator");
    expect(f.calls[0]!.body.input_handle).toBe("old-handle"); expect(f.calls[1]!.body.input_handle).toBe("creator");
  });
  it.each(["token", "title", "order", "url"])("rejects mixed snapshot %s before calibration/writes", async kind => {
    const f=fixture(); const c=context("tokopedia");
    if(kind==="token") c.binding.publication_token="b".repeat(64);
    if(kind==="title") c.confirmation.title="Another publication";
    if(kind==="order") c.confirmation.destinations.reverse();
    if(kind==="url") c.confirmation.destinations[0]!.destination_url="https://shopee.co.id/another";
    f.contexts.set("tokopedia",c); const result=await f.bundle(locator);
    expect(result?.confirmation).toEqual(product); expect(result?.intents).toEqual([]); expect(f.records.size).toBe(0); expect(f.readClock).not.toHaveBeenCalled();
  });
  it.each([null, { status: "unavailable" }, { ...context("shopee"), private: "detail" },
    { ...context("shopee"), binding: { ...context("shopee").binding, destination_hash: "b".repeat(64) } },
  ])("keeps an independent provider when one context fails %j", async failed => {
    const f=fixture(); f.contexts.set("shopee",failed); const result=await f.bundle(locator);
    expect(result?.intents.map(i=>i.provider_key)).toEqual(["tokopedia"]); expect(f.records.size).toBe(1);
  });
  it("allows availability degradation without mixing snapshot or removing safe alternatives", async () => {
    const f=fixture(); const c=context("tokopedia"); c.confirmation.destinations[0]!.available=false;
    c.confirmation.destinations[0]!.destination_url=null as unknown as string; f.contexts.set("tokopedia",c);
    f.denied.add("shopee"); const result=await f.bundle(locator); expect(result?.intents.map(i=>i.provider_key)).toEqual(["tokopedia"]);
  });
  it.each(["context", "fresh safety", "durable create"])("retains recognition with no fake action after all %s failures", async kind => {
    const f=fixture(); for(const provider of ["shopee","tokopedia"]) {
      if(kind==="context") f.contexts.set(provider,{status:"unavailable"});
      if(kind==="fresh safety") f.denied.add(provider); if(kind==="durable create") f.failedCreate.add(provider);
    }
    const result=await f.bundle(locator); expect(result?.confirmation).toEqual(product); expect(result?.intents).toEqual([]); expect(f.records.size).toBe(0);
  });
  it("does not call contexts/clock/store for all-unavailable trusted projection", async () => {
    const f=fixture(); const p={...product,destinations:product.destinations.map(d=>({...d,available:false,destination_url:null}))}; f.projection(p);
    expect(await f.bundle(locator)).toEqual({confirmation:p,intents:[]}); expect(f.calls).toHaveLength(1); expect(f.readClock).not.toHaveBeenCalled();
  });
  it.each([null,{status:"unavailable"},{...product,owner_id:"private"},{...product,spill_reference:28}])("denies invalid projection %j",async p=>{
    const f=fixture(); f.projection(p); expect(await f.bundle(locator)).toBeNull(); expect(f.calls).toHaveLength(1);
  });
  it("denies missing calibration and final expired/invalid bound without wall-clock fallback", async () => {
    const f=fixture(); const bundle=createProductClickConfirmationBundle(f.client,async()=>null);
    expect(await bundle(locator)).toBeNull(); expect(f.records.size).toBe(0);
    f.time(220000); expect(await f.bundle(locator)).toBeNull(); expect(f.records.size).toBe(2);
    f.time(NaN); expect(await f.bundle(locator)).toBeNull();
  });
  it("bounds stalled discovery and prevents late completion from starting new RPCs",async()=>{
    vi.useFakeTimers();
    try { const f=fixture(); let resume!: (response:Response)=>void;
      f.fetch.mockImplementationOnce(()=>new Promise(resolve=>{resume=resolve;})); const result=f.bundle(locator);
      await vi.advanceTimersByTimeAsync(10000); expect(await result).toBeNull();
      resume(new Response(JSON.stringify(product),{headers:{"content-type":"application/json"}})); await vi.advanceTimersByTimeAsync(0);
      expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.records.size).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("prevents late fresh resolution from starting a create after the bundle deadline", async () => {
    vi.useFakeTimers();
    try {
      const f=fixture(); const original=f.fetch.getMockImplementation()!; let resume!: (response:Response)=>void;
      f.fetch.mockImplementation((input,init)=>String(input).endsWith("resolve_published_product_destination_server")
        ? new Promise(resolve=>{resume=resolve;}) : original(input,init));
      const result=f.bundle(locator); await vi.advanceTimersByTimeAsync(10000); expect(await result).toBeNull();
      resume(new Response(JSON.stringify({status:"success",destination_url:product.destinations[0]!.destination_url}),{headers:{"content-type":"application/json"}}));
      await vi.advanceTimersByTimeAsync(0); expect(f.records.size).toBe(0);
      expect(f.calls.some(c=>c.name==="create_product_click_intent_server")).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("preserves an independent token after one provider's durable create fails",async()=>{
    const f=fixture(); f.failedCreate.add("shopee"); const result=await f.bundle(locator);
    expect(result?.intents.map(i=>i.provider_key)).toEqual(["tokopedia"]); expect(f.records.size).toBe(1);
  });
  it("contains a provider SDK permission error without leaking private detail or retry",async()=>{
    const f=fixture(); const original=f.fetch.getMockImplementation()!;
    f.fetch.mockImplementation((input,init)=>String(input).endsWith("resolve_published_product_click_context_server")
      && JSON.parse(String(init?.body)).input_provider_key==="shopee"
      ? Promise.resolve(new Response(JSON.stringify({message:"private permission detail"}),{status:403})) : original(input,init));
    const result=await f.bundle(locator); expect(result?.intents.map(i=>i.provider_key)).toEqual(["tokopedia"]);
    expect(JSON.stringify(result)).not.toContain("private permission detail");
    expect(f.fetch.mock.calls.filter(([input,init])=>String(input).endsWith("resolve_published_product_click_context_server")
      && JSON.parse(String(init?.body)).input_provider_key==="shopee")).toHaveLength(1);
  });
});


describe("unmounted guarded Product bundle HTTP", () => {
  const origin = "https://app.example.test";
  const request = (body: unknown, signal?: AbortSignal) => new Request(`${origin}/staged-bundle`, { method: "POST",
    headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
  it.each([{ ...locator, provider_key: "shopee" }, { ...locator, token: "A".repeat(43) },
    { ...locator, confirmation: product }, { ...locator, destination_url: product.destinations[0]!.destination_url },
    { ...locator, binding: context("shopee").binding }, { ...locator, owner_id: "spoof" },
    { ...locator, spill_reference: "27" }, { ...locator, spill_reference: Number.MAX_SAFE_INTEGER + 1 }])
    ("rejects caller authority/invalid locator before RPC %j", async body => {
      const f = fixture(); const permit = vi.fn(async (request: Request, action: string) => {
        expect(request.method).toBe("POST"); expect(action).toBe("issue"); return true;
      });
      const http = createProductClickHttpBoundary({ client: f.client, origin, permit });
      const response = await http.issueBundle(request(body)); expect(response.status).toBe(403);
      expect(response.headers.get("Location")).toBeNull(); expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(f.fetch).not.toHaveBeenCalled(); expect(permit).toHaveBeenCalledTimes(1);
      expect(permit.mock.calls[0]?.[1]).toBe("issue");
    });
  it.each([false, null, "true"])("denies non-literal distributed permit %j", async value => {
    const f = fixture(); const http = createProductClickHttpBoundary({ client: f.client, origin, permit: async () => value });
    expect((await http.issueBundle(request(locator))).status).toBe(403); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("denies mismatched origin before permit or RPC", async () => {
    const f = fixture(); const permit = vi.fn(async () => true);
    const http = createProductClickHttpBoundary({ client: f.client, origin, permit });
    const req = request(locator); req.headers.set("origin", "https://attacker.example.test");
    expect((await http.issueBundle(req)).status).toBe(403); expect(permit).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("returns trusted all-unavailable recognition without creating intents", async () => {
    const f = fixture(); f.projection({ ...product, destinations: product.destinations.map(d => ({ ...d, available: false, destination_url: null })) });
    const http = createProductClickHttpBoundary({ client: f.client, origin, permit: async () => true });
    const response = await http.issueBundle(request(locator)); expect(response.status).toBe(200);
    expect((await response.json()).intents).toEqual([]); expect(f.calls).toHaveLength(1); expect(f.records.size).toBe(0);
  });
  it("returns only independent available provider intents", async () => {
    const f = fixture(); f.denied.add("shopee");
    const http = createProductClickHttpBoundary({ client: f.client, origin, permit: async () => true });
    const response = await http.issueBundle(request(locator)); expect(response.status).toBe(200);
    expect((await response.json()).intents.map((i: { provider_key: string }) => i.provider_key)).toEqual(["tokopedia"]);
  });
  it("denies aborted operation without leaking late-created authority", async () => {
    const f = fixture(); const controller = new AbortController();
    const http = createProductClickHttpBoundary({ client: f.client, origin, permit: async () => { controller.abort(); return true; } });
    expect((await http.issueBundle(request(locator, controller.signal))).status).toBe(403); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("bounds pending SDK work and returns uniform unavailable", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); f.fetch.mockImplementation(() => new Promise<Response>(() => {}));
      const http = createProductClickHttpBoundary({ client: f.client, origin, permit: async () => true });
      const pending = http.issueBundle(request(locator)); await vi.advanceTimersByTimeAsync(10000);
      const response = await pending; expect(response.status).toBe(403); expect(response.headers.get("Location")).toBeNull();
      expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(await response.text()).not.toContain("binding");
    } finally { vi.useRealTimers(); }
  });
});
