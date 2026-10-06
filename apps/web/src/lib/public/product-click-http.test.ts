import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createProductClickHttpBoundary } from "./product-click-http";

const origin = "https://app.example.test";
const locator = { handle: "creator", spill_reference: 27, provider_key: "shopee" };
const originalUrl = "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function request(body: unknown, signal?: AbortSignal) {
  return new Request(`${origin}/staged-action`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
}
function fixture(url = originalUrl) {
  let stored: unknown = null; let safe = true; let clockOffset = 0;
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  const confirmation = { status: "success", current_handle: "creator", display_name: "Published Owner", spill_reference: 27,
    title: "Published Product", primary_image_path: "/media/product/creator/27", destinations: [{ provider_key: "shopee", available: true, destination_url: url }] };
  const binding = { ...locator, publication_token: "a".repeat(64), destination_hash: hash(url) };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const name = String(input).split("/").at(-1)!; const body = JSON.parse(String(init?.body ?? "{}")); calls.push({ name, body });
    expect(init?.method).toBe("POST"); expect(new Headers(init?.headers).get("content-profile")).toBe("api");
    let data: unknown = null;
    if (name === "read_product_click_clock_server") data = 100_000 + Math.floor(performance.now()) + clockOffset;
    if (name === "resolve_published_product_click_context_server") data = { status: "success", confirmation, binding };
    if (name === "resolve_published_product_destination_server" || name === "resolve_product_click_intent_destination_server")
      data = safe ? { status: "success", destination_url: url } : { status: "unavailable" };
    if (name === "create_product_click_intent_server") { stored = body.input_record; data = true; }
    if (name === "consume_product_click_intent_server") { data = stored; stored = null; }
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://http-fixture.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  const permit = vi.fn(async () => true);
  return { http: createProductClickHttpBoundary({ client, origin, permit }), permit, fetch, calls, confirmation,
    stored: () => stored, unsafe: () => { safe = false; }, expire: () => { clockOffset = 120_000; } };
}
function cacheTruth(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("Pragma")).toBe("no-cache"); expect(response.headers.get("Expires")).toBe("0");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
}
async function denial(response: Response) {
  expect(response.status).toBe(403); cacheTruth(response); expect(response.headers.has("Location")).toBe(false);
  expect(await response.json()).toEqual({ status: "unavailable" });
}
describe("unmounted strict private Product HTTP assembly", () => {
  it("uses actual SDK context/calibration/create/committed consume/final resolver and exact Location", async () => {
    const f = fixture(); const first = request(locator); const response = await f.http.issue(first);
    expect(response.status).toBe(200); cacheTruth(response); expect(response.headers.has("Location")).toBe(false);
    const result = await response.json(); expect(Object.keys(result)).toEqual(["confirmation", "token"]);
    expect(result.confirmation).toEqual(f.confirmation); expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(result)).not.toContain("publication_token"); expect(JSON.stringify(result)).not.toContain("destination_hash");
    const record = f.stored(); const second = request({ ...locator, token: result.token });
    const outbound = await f.http.redeem(second); expect(outbound.status).toBe(303); cacheTruth(outbound);
    expect(outbound.headers.get("Location")).toBe(originalUrl); expect(await outbound.text()).toBe(""); expect(f.stored()).toBeNull();
    expect(f.calls.map(c => c.name)).toEqual(["resolve_published_product_click_context_server", "read_product_click_clock_server",
      "resolve_published_product_destination_server", "create_product_click_intent_server", "read_product_click_clock_server",
      "consume_product_click_intent_server", "resolve_product_click_intent_destination_server"]);
    expect(f.calls.at(-1)!.body).toEqual({ input_record: record });
    expect(f.permit).toHaveBeenNthCalledWith(1, first, "issue"); expect(f.permit).toHaveBeenNthCalledWith(2, second, "redeem");
    await denial(await f.http.redeem(request({ ...locator, token: result.token })));
  });
  it("accepts a protected alias only through trusted canonical confirmation", async () => {
    const f = fixture(); const response = await f.http.issue(request({ ...locator, handle: "OLD-HANDLE" }));
    expect(response.status).toBe(200); const result = await response.json(); expect(result.confirmation.current_handle).toBe("creator");
    expect(f.calls[0]!.body.input_handle).toBe("old-handle");
    expect((await f.http.redeem(request({ ...locator, token: result.token }))).status).toBe(303);
  });
  it.each([null, {}, { ...locator, destination_url: originalUrl }, { ...locator, owner_id: "forged" },
    { ...locator, confirmation: {} }, { ...locator, publication_token: "a".repeat(64) }, { ...locator, token: "forged" },
    { ...locator, spill_reference: "27" }, { ...locator, spill_reference: 0 }, { ...locator, provider_key: "spoof" },
  ])("denies forged/non-locator issuance %j before RPC", async (body) => {
    const f = fixture(); await denial(await f.http.issue(request(body))); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...locator, token: "bad" }, { ...locator, token: "A".repeat(42)+"B" },
    { ...locator, token: "A".repeat(43), destination_url: originalUrl }, { ...locator, token: "A".repeat(43), owner_id: "forged" },
  ])("denies malformed/raw-authority redemption %j before RPC", async (body) => {
    const f = fixture(); await denial(await f.http.redeem(request(body))); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([{ handle: "another" }, { spill_reference: 28 }, { provider_key: "tokopedia" }])("burns cross-context capability %j", async (other) => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    await denial(await f.http.redeem(request({ ...locator, ...other, token: result.token }))); expect(f.stored()).toBeNull();
    await denial(await f.http.redeem(request({ ...locator, token: result.token })));
  });
  it.each(["unsafe", "expired"])("denies fresh %s state with no redirect or restoration", async (kind) => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    if (kind === "unsafe") f.unsafe(); else f.expire();
    await denial(await f.http.redeem(request({ ...locator, token: result.token }))); expect(f.stored()).toBeNull();
  });
  it("denies missing permission/provider error without private detail or mutation retry", async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: "private database detail" }), { status: 403 }));
    await denial(await f.http.issue(request(locator))); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it("never calls core/RPC when request Origin or permit fails", async () => {
    const f = fixture(); const r = request(locator); r.headers.set("origin", "https://evil.test");
    await denial(await f.http.issue(r)); expect(f.permit).not.toHaveBeenCalled(); expect(f.fetch).not.toHaveBeenCalled();
    f.permit.mockResolvedValueOnce(false); await denial(await f.http.issue(request(locator))); expect(f.fetch).not.toHaveBeenCalled();
  });
  it("fails closed on unsupported Location encoding and keeps consumed authority burned", async () => {
    const f = fixture("https://shopee.co.id/☃?affiliate=creator"); const issued = await f.http.issue(request(locator)); expect(issued.status).toBe(200);
    const result = await issued.json(); await denial(await f.http.redeem(request({ ...locator, token: result.token }))); expect(f.stored()).toBeNull();
  });
  it("bounds a hanging core result without retry or returning an intent", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); f.fetch.mockImplementationOnce(() => new Promise(() => {}));
      const result = f.http.issue(request(locator)); await vi.advanceTimersByTimeAsync(10000);
      await denial(await result); expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.stored()).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("denies request abortion after consume without restoring or returning Location", async () => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    const controller = new AbortController(); const original = f.fetch.getMockImplementation()!;
    f.fetch.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      if (String(input).endsWith("consume_product_click_intent_server")) controller.abort();
      return response;
    });
    await denial(await f.http.redeem(request({ ...locator, token: result.token }, controller.signal))); expect(f.stored()).toBeNull();
  });
  it("keeps consumed authority burned when its response stalls beyond HTTP deadline", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); const result = await (await f.http.issue(request(locator))).json(); const original = f.fetch.getMockImplementation()!;
      f.fetch.mockImplementation(async (input, init) => {
        const response = await original(input, init);
        return String(input).endsWith("consume_product_click_intent_server") ? new Promise(() => {}) : response;
      });
      const response = f.http.redeem(request({ ...locator, token: result.token }));
      await vi.advanceTimersByTimeAsync(10000); await denial(await response); expect(f.stored()).toBeNull();
      expect(f.calls.filter(c => c.name === "consume_product_click_intent_server")).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
});
