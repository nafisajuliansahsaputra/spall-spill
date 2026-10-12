import { createHash, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNetworkBudgetedResourceOpenHttpBoundary } from "../src/lib/public/resource-open-network-http";
import { createResourceOpenUpstashBudgetTransport } from "../src/lib/public/resource-open-budget-upstash";
import { PublishedResourceRecognitionActions } from "../src/lib/public/resource-recognition-actions";
import { chromiumFixture, until } from "./chromium-fixture";

const origin = "https://app.example.test";
const page = `${origin}/creator/spill/27`;
const source = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const recognition = { status: "success", current_handle: "creator", display_name: "Published Owner", spill_reference: 27,
  resource_type: "portfolio", title: "Published Portfolio", available: true, source_url: source };
function fixture() {
  const records = new Map<string, unknown>(); const calls: { name: string; args: unknown }[] = [];
  const reads: string[] = []; const commands: string[][] = [];
  const state = { clockOffset: 0, safe: true, denyRedeem: false, address: "192.0.2.1",
    metadata: "valid" as "valid" | "absent" | "late", lateCompleted: 0 };
  const client = createClient("https://browser-sdk-fixture.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
      const name = String(input).split("/").at(-1)!; const args = JSON.parse(String(init?.body ?? "{}")); calls.push({ name, args });
      expect(init?.method).toBe("POST"); expect(new Headers(init?.headers).get("content-profile")).toBe("api");
      let result: unknown = null;
      if (name === "resolve_published_resource_context_server") result = { status: "success", recognition,
        binding: { handle: "creator", spill_reference: 27, publication_token: "a".repeat(64),
          source_hash: createHash("sha256").update(source).digest("hex") } };
      if (name === "read_resource_open_clock_server") result = 100000 + Math.floor(performance.now()) + state.clockOffset;
      if (name === "resolve_published_resource_source_server" || name === "resolve_resource_open_intent_source_server")
        result = state.safe ? { status: "success", source_url: source } : { status: "unavailable" };
      if (name === "create_resource_open_intent_server") { records.set(args.input_token_hash, args.input_record); result = true; }
      if (name === "consume_resource_open_intent_server") { result = records.get(args.input_token_hash) ?? null; records.delete(args.input_token_hash); }
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    } },
  });
  const redis = createResourceOpenUpstashBudgetTransport({ origin: "https://browser-fixture.upstash.io", namespace: "resource-browser-test",
    token: "test-only-bearer-placeholder" }, async (input, init) => {
    expect(String(input)).toBe("https://browser-fixture.upstash.io/"); expect(init?.cache).toBe("no-store"); expect(init?.redirect).toBe("error");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-only-bearer-placeholder");
    const command = JSON.parse(String(init?.body)) as string[]; commands.push(command);
    return new Response(JSON.stringify({ result: state.denyRedeem && command.at(-1) === "3" ? 0 : 1 }), { headers: { "content-type": "application/json" } });
  });
  const http = createNetworkBudgetedResourceOpenHttpBoundary({ client, origin, redis, key: new Uint8Array(32).fill(13),
    policy: { namespace: "resource-browser-test", window_ms: 60000, issue_limit: 100, redeem_limit: 100, work_limit: 1000 },
    readTrustedMetadata: async request => {
      reads.push(new URL(request.url).pathname);
      if (state.metadata === "absent") return null;
      if (state.metadata === "late") { await new Promise(resolve => setTimeout(resolve, 600)); state.lateCompleted++; }
      return { address: state.address };
    } });
  return { http, records, calls, reads, commands, state };
}
async function issue(f: ReturnType<typeof fixture>) {
  const response = await f.http.issue(new Request(`${origin}/staged`, { method: "POST",
    headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ handle: "previous", reference: "#27" }) }));
  expect(response.status).toBe(200); const payload = await response.json();
  expect(payload.recognition).toEqual(recognition); expect(payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(f.calls[0]).toEqual({ name: "resolve_published_resource_context_server", args: { input_handle: "previous", input_spill_reference: 27 } });
  expect(f.calls.map(c => c.name)).toEqual(["resolve_published_resource_context_server", "read_resource_open_clock_server",
    "resolve_published_resource_source_server", "create_resource_open_intent_server"]);
  expect(f.records.size).toBe(1); f.calls.length = 0; return payload;
}
type Paused = { requestId: string; request: { url: string; method: string; headers: Record<string, string>; postData?: string } };
async function navigationFixture(f: ReturnType<typeof fixture>, payload: unknown, forms = 1, referrerPolicy = "same-origin") {
  const directory = new URL("../.next/static/chunks/", import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith(".css")).sort();
  if (!files.length) throw new Error("Production CSS missing: build web first");
  const css = (await Promise.all(files.map(name => readFile(new URL(name, directory), "utf8")))).join("\n");
  const html = `<!doctype html><html><head><style>${css}</style></head><body>${renderToStaticMarkup(createElement(PublishedResourceRecognitionActions, { payload }))}</body></html>`;
  const browser = await chromiumFixture(); const failures: unknown[] = [];
  const posts: { request: Request; response: Response }[] = []; const outbound: { url: string; headers: Headers }[] = [];
  browser.on("Fetch.requestPaused", value => {
    const paused = value as Paused;
    void (async () => {
      let response: Response;
      if (paused.request.method === "GET" && paused.request.url === page) response = new Response(html, {
        headers: { "content-type": "text/html", "cache-control": "private, no-store", "referrer-policy": referrerPolicy } });
      else if (paused.request.method === "POST" && paused.request.url === `${origin}/actions/resource-open`) {
        const request = new Request(paused.request.url, { method: "POST", headers: paused.request.headers, body: paused.request.postData ?? "" });
        response = await f.http.redeemForm(request.clone()); posts.push({ request, response: response.clone() });
      } else if (paused.request.method === "GET" && paused.request.url === source) {
        outbound.push({ url: paused.request.url, headers: new Headers(paused.request.headers) });
        response = new Response("Resource navigation stub: no provider contacted", { headers: { "content-type": "text/plain" } });
      } else if (paused.request.method === "GET" && [origin, new URL(source).origin].some(o => paused.request.url === `${o}/favicon.ico`)) response = new Response(null, { status: 204 });
      else { failures.push(`Unexpected request: ${paused.request.method} ${paused.request.url}`);
        await browser.command("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }); return; }
      await browser.command("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: response.status,
        responseHeaders: [...response.headers].map(([name, value]) => ({ name, value })), body: Buffer.from(await response.arrayBuffer()).toString("base64") });
    })().catch(error => { failures.push(error); void browser.command("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }).catch(() => {}); });
  });
  browser.on("Runtime.exceptionThrown", value => failures.push(value));
  try {
    await browser.command("Runtime.enable"); await browser.command("Page.enable");
    await browser.command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  } catch (error) { await browser.close(); throw error; }
  const navigate = async () => { await browser.command("Page.navigate", { url: page });
    await until(() => browser.evaluate<boolean>(`document.readyState === 'complete' && Boolean(document.querySelector('h1')) && document.forms.length === ${forms}`)); };
  const click = async () => {
    const point = await browser.evaluate<{ x: number; y: number }>(`(() => { const b = document.querySelector('button'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x+r.width/2, y: r.y+r.height/2 }; })()`);
    await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  };
  const denied = async () => {
    await until(() => browser.evaluate<boolean>("document.readyState === 'complete' && location.pathname === '/actions/resource-open' && document.forms.length === 0"));
    const response = posts.at(-1)!.response; expect(response.status).toBe(403); expect(response.headers.get("Location")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0"); expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await response.clone().json()).toEqual({ status: "unavailable" });
  };
  return { browser, navigate, click, denied, posts, outbound, failures };
}

it("actual Chromium shows Resource context before explicit native Open, preserves URL and denies replay", async () => {
  const f = fixture(); const payload = await issue(f); const record = [...f.records.values()][0];
  const b = await navigationFixture(f, payload);
  f.state.address = "::ffff:192.0.2.1";
  try {
    await b.navigate(); expect(b.posts).toHaveLength(0); expect(b.outbound).toHaveLength(0); expect(f.calls).toEqual([]);
    expect(f.reads).toEqual(["/staged"]); expect(f.commands).toHaveLength(1);
    const context = await b.browser.evaluate<{ title: string; text: string; links: string[]; first: boolean; height: number; label: string; action: string; method: string; names: string[] }>(`({
      title: document.querySelector('h1').textContent, text: document.body.innerText,
      links: [...document.querySelectorAll('a')].map(a => a.href),
      first: Boolean(document.querySelector('h1').compareDocumentPosition(document.querySelector('form')) & Node.DOCUMENT_POSITION_FOLLOWING),
      height: document.querySelector('button').getBoundingClientRect().height, label: document.querySelector('button').textContent.trim(),
      action: document.forms[0].action, method: document.forms[0].method, names: [...document.forms[0].elements].filter(e => e.name).map(e => e.name) })`);
    expect(context.title).toBe(recognition.title); expect(context.text).toContain(recognition.display_name); expect(context.text).toContain("#27"); expect(context.text).toContain("Portfolio");
    expect(context.links).toEqual([`${origin}/creator`, `${origin}/creator/spill`]); expect(context.first).toBe(true); expect(context.height).toBeGreaterThanOrEqual(44);
    expect(context.label).toBe("View Portfolio"); expect(context.action).toBe(`${origin}/actions/resource-open`); expect(context.method).toBe("post");
    expect(context.names).toEqual(["handle", "spill_reference", "token"]); expect(f.records.size).toBe(1);
    await b.click(); await until(() => b.browser.evaluate<boolean>("document.readyState === 'complete' && document.body.innerText.includes('Resource navigation stub')"));
    expect(b.outbound).toHaveLength(1); expect(b.outbound[0]!.url).toBe(source); expect(b.outbound[0]!.headers.has("Referer")).toBe(false);
    const post = b.posts[0]!; expect(post.response.status).toBe(303); expect(post.response.headers.get("Location")).toBe(source);
    expect(post.response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0"); expect(post.response.headers.get("Referrer-Policy")).toBe("no-referrer"); expect(await post.response.text()).toBe("");
    expect(post.request.headers.get("Origin")).toBe(origin); expect(post.request.headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");
    expect([...new URLSearchParams(await post.request.text())]).toEqual([["handle", "creator"], ["spill_reference", "27"], ["token", payload.token]]);
    expect(f.calls.map(c => c.name)).toEqual(["read_resource_open_clock_server", "consume_resource_open_intent_server", "resolve_resource_open_intent_source_server"]);
    expect(f.calls.at(-1)!.args).toEqual({ input_record: record }); expect(f.records.size).toBe(0);
    await b.navigate(); await b.click(); await b.denied(); expect(b.posts).toHaveLength(2); expect(b.outbound).toHaveLength(1);
    expect(f.records.size).toBe(0); expect(f.reads).toEqual(["/staged", "/actions/resource-open", "/actions/resource-open"]);
    const subject = createHmac("sha256", new Uint8Array(32).fill(13)).update(["spall-resource-open-network-subject-v1", "resource-browser-test", "4:192.0.2.1"].join("\0")).digest("base64url");
    const digest = createHash("sha256").update(`resource-browser-test\0${subject}`).digest("hex");
    expect(f.commands.map(c => c.at(-1))).toEqual(["4", "3", "3"]);
    expect(f.commands.map(c => c[3])).toEqual([`spall-resource-open:resource-browser-test:{${digest}}:issue`, ...Array<string>(2).fill(`spall-resource-open:resource-browser-test:{${digest}}:redeem`)]);
    expect(new Set(f.commands.map(c => c[4]))).toEqual(new Set([`spall-resource-open:resource-browser-test:{${digest}}:work`]));
    for (const secret of ["192.0.2.1", payload.token, source, "bearer-placeholder"]) expect(JSON.stringify(f.commands)).not.toContain(secret);
    expect(b.failures).toEqual([]);
  } finally { await b.browser.close(); }
});

it.each(["cross-reference", "expired", "unsafe source", "denied permit"] as const)("actual Chromium denies %s and never restores consumed authority", async scenario => {
  const f = fixture(); const payload = await issue(f); const b = await navigationFixture(f, payload);
  if (scenario === "expired") f.state.clockOffset = 120001;
  if (scenario === "unsafe source") f.state.safe = false;
  if (scenario === "denied permit") f.state.denyRedeem = true;
  try {
    await b.navigate(); expect(b.posts).toHaveLength(0); expect(b.outbound).toHaveLength(0); expect(f.calls).toEqual([]);
    expect(f.reads).toEqual(["/staged"]); expect(f.commands).toHaveLength(1);
    if (scenario === "cross-reference") await b.browser.evaluate("document.forms[0].elements.namedItem('spill_reference').value = '28'");
    await b.click(); await b.denied(); expect(b.posts).toHaveLength(1); expect(b.outbound).toHaveLength(0);
    expect(f.records.size).toBe(scenario === "denied permit" ? 1 : 0);
    const calls = scenario === "denied permit" ? [] : ["read_resource_open_clock_server", "consume_resource_open_intent_server",
      ...(scenario === "unsafe source" ? ["resolve_resource_open_intent_source_server"] : [])];
    expect(f.calls.map(c => c.name)).toEqual(calls);
    await b.navigate(); await b.click(); await b.denied(); expect(b.posts).toHaveLength(2); expect(b.outbound).toHaveLength(0);
    expect(f.records.size).toBe(scenario === "denied permit" ? 1 : 0);
    expect(f.calls.map(c => c.name)).toEqual([...calls, ...(scenario === "denied permit" ? [] : ["read_resource_open_clock_server", "consume_resource_open_intent_server"])]);
    expect(f.reads).toEqual(["/staged", "/actions/resource-open", "/actions/resource-open"]);
    expect(f.commands.map(c => c.at(-1))).toEqual(["4", "3", "3"]); expect(b.failures).toEqual([]);
  } finally { await b.browser.close(); }
});

it.each(["missing token", "degraded source"] as const)("actual Chromium retains recognition/recovery with %s and no action", async scenario => {
  const f = fixture(); const payload = await issue(f);
  if (scenario === "missing token") payload.token = null;
  else payload.recognition = { ...payload.recognition, available: false, source_url: null };
  const b = await navigationFixture(f, payload, 0);
  try {
    await b.navigate();
    const context = await b.browser.evaluate<{ title: string; text: string; buttons: number; links: string[] }>(`({ title: document.querySelector('h1').textContent,
      text: document.body.innerText, buttons: document.querySelectorAll('button').length, links: [...document.querySelectorAll('a')].map(a => a.href) })`);
    expect(context.title).toBe(recognition.title); expect(context.text).toContain(recognition.display_name); expect(context.text).toContain("temporarily unavailable");
    expect(context.buttons).toBe(0); expect(context.links).toEqual([`${origin}/creator`, `${origin}/creator/spill`]);
    expect(b.posts).toHaveLength(0); expect(b.outbound).toHaveLength(0); expect(f.calls).toEqual([]); expect(f.reads).toEqual(["/staged"]); expect(f.commands).toHaveLength(1);
    expect(f.records.size).toBe(1); expect(b.failures).toEqual([]);
  } finally { await b.browser.close(); }
});


it("actual Chromium with no-referrer context denies null Origin before permit and RPC", async () => {
  const f = fixture(); const payload = await issue(f); const b = await navigationFixture(f, payload, 1, "no-referrer");
  try {
    await b.navigate(); await b.click(); await b.denied();
    expect(b.posts).toHaveLength(1); expect(b.posts[0]!.request.headers.get("Origin")).toBe("null");
    expect(f.reads).toEqual(["/staged"]); expect(f.commands).toHaveLength(1); expect(f.calls).toEqual([]); expect(f.records.size).toBe(1);
    expect(b.outbound).toHaveLength(0); expect(b.failures).toEqual([]);
  } finally { await b.browser.close(); }
});


it.each(["absent", "late"] as const)("actual network-budgeted Chromium denies %s metadata before REST/RPC and retains intent", async metadata => {
  const f = fixture(); const payload = await issue(f); f.state.metadata = metadata;
  const b = await navigationFixture(f, payload);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      await b.navigate(); await b.click(); await b.denied();
      expect(b.posts).toHaveLength(attempt + 1); expect(b.outbound).toHaveLength(0);
      expect(f.records.size).toBe(1); expect(f.calls).toEqual([]); expect(f.commands).toHaveLength(1);
    }
    if (metadata === "late") await until(() => f.state.lateCompleted === 2);
    expect(f.reads).toEqual(["/staged", "/actions/resource-open", "/actions/resource-open"]);
    expect(f.calls).toEqual([]); expect(f.commands).toHaveLength(1); expect(f.records.size).toBe(1); expect(b.failures).toEqual([]);
  } finally { await b.browser.close(); }
});
