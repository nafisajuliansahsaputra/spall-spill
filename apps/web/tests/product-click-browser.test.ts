import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { createNetworkBudgetedProductClickHttpBoundary } from "../src/lib/public/product-click-network-http";
import { PublishedProductConfirmationActions } from "../src/lib/public/product-confirmation-actions";
import type { ProductClickIntentRecord } from "../src/lib/public/product-click-intent";
import { chromiumFixture, until } from "./chromium-fixture";

const origin = "https://app.example.test";
const locator = { handle: "creator", spill_reference: 27 };
const product = { status: "success", current_handle: "creator", display_name: "Published Creator", spill_reference: 27,
  title: "Published Product", primary_image_path: "/media/product/creator/27", destinations: [
    { provider_key: "shopee", available: true, destination_url: "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB" },
    { provider_key: "tokopedia", available: true, destination_url: "https://tokopedia.com/item?affiliate=creator" },
  ] };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const records = new Map<string, ProductClickIntentRecord>(); const costs: string[] = [];
  const client = createClient("https://browser-sdk-fixture.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
      const name = String(input).split("/").at(-1)!; const body = JSON.parse(String(init?.body ?? "{}")); let result: unknown = null;
      if (name === "resolve_public_product") result = product;
      if (name === "read_product_click_clock_server") result = 100000 + Math.floor(performance.now());
      if (name === "resolve_published_product_click_context_server") {
        const destination = product.destinations.find(d => d.provider_key === body.input_provider_key)!;
        result = { status: "success", confirmation: product, binding: { ...locator, provider_key: destination.provider_key,
          publication_token: "a".repeat(64), destination_hash: hash(destination.destination_url) } };
      }
      if (name === "create_product_click_intent_server") { records.set(body.input_token_hash, body.input_record); result = true; }
      if (name === "consume_product_click_intent_server") { result = records.get(body.input_token_hash) ?? null; records.delete(body.input_token_hash); }
      if (name === "resolve_published_product_destination_server" || name === "resolve_product_click_intent_destination_server") {
        const provider = name === "resolve_product_click_intent_destination_server" ? body.input_record.binding.provider_key : body.input_provider_key;
        result = { status: "success", destination_url: product.destinations.find(d => d.provider_key === provider)!.destination_url };
      }
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
    } },
  });
  const http = createNetworkBudgetedProductClickHttpBoundary({ client, origin, key: new Uint8Array(32).fill(13),
    readTrustedMetadata: async () => ({ address: "192.0.2.1" }),
    policy: { namespace: "browser-test", window_ms: 60000, issue_limit: 100, redeem_limit: 100, work_limit: 1000 },
    redis: { eval: async (_script, _keys, args) => { costs.push(args[3]!); return 1; } } });
  return { http, records, costs };
}
type Paused = { requestId: string; request: { url: string; method: string; headers: Record<string, string>; postData?: string } };
async function documentHtml(payload: unknown) {
  const directory = new URL("../.next/static/chunks/", import.meta.url);
  const files = (await readdir(directory)).filter(name => name.endsWith(".css")).sort();
  if (!files.length) throw new Error("Production CSS missing: build web first");
  const css = (await Promise.all(files.map(name => readFile(new URL(name, directory), "utf8")))).join("\n");
  return `<!doctype html><html><head><style>${css}</style></head><body>${renderToStaticMarkup(createElement(PublishedProductConfirmationActions, { payload }))}</body></html>`;
}

it("real Chromium confirms before native POST, preserves attribution, and denies replay with fixtures", async () => {
  const f = fixture(); const issued = await f.http.issueBundle(new Request(`${origin}/staged`, { method: "POST",
    headers: { origin, "content-type": "application/json" }, body: JSON.stringify(locator) }));
  expect(issued.status).toBe(200); const payload = await issued.json();
  const html = await documentHtml(payload);
  const browser = await chromiumFixture(); const failures: unknown[] = []; const outbound: string[] = [];
  const posts: { request: Request; status: number; headers: Headers }[] = [];
  try {
    browser.on("Fetch.requestPaused", value => {
      const paused = value as Paused;
      void (async () => {
        let response: Response;
        if (paused.request.url === `${origin}/creator/spill/27` && paused.request.method === "GET") {
          response = new Response(html, { headers: { "content-type": "text/html", "cache-control": "no-store" } });
        } else if (paused.request.url === `${origin}/actions/product-click` && paused.request.method === "POST") {
          const request = new Request(paused.request.url, { method: "POST", headers: paused.request.headers, body: paused.request.postData ?? "" });
          response = await f.http.redeemForm(request.clone()); posts.push({ request, status: response.status, headers: response.headers });
        } else if (paused.request.url === `${origin}${product.primary_image_path}`) {
          response = new Response(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5GQAAAAASUVORK5CYII=", "base64"), { headers: { "content-type": "image/png" } });
        } else if (product.destinations.some(d => d.destination_url === paused.request.url) && paused.request.method === "GET") {
          outbound.push(paused.request.url); response = new Response("Marketplace navigation stub — no provider contacted", { headers: { "content-type": "text/plain" } });
        } else if (paused.request.method === "GET" && [origin, ...product.destinations.map(d => new URL(d.destination_url).origin)].some(o => paused.request.url === `${o}/favicon.ico`)) response = new Response(null, { status: 204 });
        else { failures.push(new Error(`Unexpected page request: ${paused.request.method} ${paused.request.url}`)); await browser.command("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }); return; }
        const responseHeaders = [...response.headers].map(([name, value]) => ({ name, value }));
        await browser.command("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: response.status, responseHeaders,
          body: Buffer.from(await response.arrayBuffer()).toString("base64") });
      })().catch(error => { failures.push(error); void browser.command("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }).catch(() => {}); });
    });
    browser.on("Runtime.exceptionThrown", value => failures.push(value));
    await browser.command("Runtime.enable"); await browser.command("Page.enable");
    await browser.command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    const navigate = async () => { await browser.command("Page.navigate", { url: `${origin}/creator/spill/27` });
      await until(() => browser.evaluate<boolean>("document.readyState === 'complete' && document.querySelectorAll('form').length === 2")); };
    await navigate(); expect(posts).toHaveLength(0); expect(outbound).toHaveLength(0);
    const forms = await browser.evaluate<{ titleFirst: boolean; names: string[][]; actions: string[]; methods: string[]; labels: string[] }>(`JSON.parse(JSON.stringify({
      titleFirst: Boolean(document.querySelector('h1').compareDocumentPosition(document.querySelector('form')) & Node.DOCUMENT_POSITION_FOLLOWING),
      names: [...document.forms].map(f => [...f.elements].filter(e => e.name).map(e => e.name)),
      actions: [...document.forms].map(f => f.action), methods: [...document.forms].map(f => f.method),
      labels: [...document.querySelectorAll('button')].map(b => b.textContent.trim()) }))`);
    expect(forms.titleFirst).toBe(true); expect(forms.actions).toEqual([`${origin}/actions/product-click`, `${origin}/actions/product-click`]);
    expect(forms.methods).toEqual(["post", "post"]); expect(forms.labels).toEqual(["Open in Shopee", "Open in Tokopedia"]);
    expect(forms.names).toEqual(Array.from({ length: 2 }, () => ["handle", "spill_reference", "provider_key", "token"]));
    for (let index = 0; index < 2; index++) {
      if (index) await navigate();
      const click = async () => { const point = await browser.evaluate<{ x: number; y: number }>(`(() => { const button = document.querySelectorAll('button')[${index}]; button.scrollIntoView({ block: 'center' }); const r = button.getBoundingClientRect(); return { x: r.x+r.width/2, y: r.y+r.height/2 }; })()`);
        await browser.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
        await browser.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }); };
      await click();
      try { await until(() => outbound.length === index + 1); }
      catch (error) { throw new Error(JSON.stringify({ statuses: posts.map(p => p.status), outbound, failures: failures.map(String) }), { cause: error }); }
      await until(() => browser.evaluate<boolean>("document.readyState === 'complete' && document.body.innerText.includes('Marketplace navigation stub')"));
      const post = posts.at(-1)!; expect(post.status).toBe(303); expect(post.headers.get("Location")).toBe(product.destinations[index]!.destination_url);
      expect(post.headers.get("Cache-Control")).toContain("no-store"); expect(post.request.headers.get("Origin")).toBe(origin);
      expect(post.request.headers.get("Content-Type")).toContain("application/x-www-form-urlencoded");
      const fields = new URLSearchParams(await post.request.text()); expect([...fields.keys()]).toEqual(["handle", "spill_reference", "provider_key", "token"]);
      expect(fields.get("handle")).toBe(locator.handle); expect(fields.get("spill_reference")).toBe(String(locator.spill_reference));
      expect(fields.get("token")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(fields.get("provider_key")).toBe(product.destinations[index]!.provider_key);
      await navigate(); const count = posts.length; await click(); await until(() => posts.length === count + 1);
      await until(() => browser.evaluate<boolean>("document.readyState === 'complete' && location.pathname === '/actions/product-click' && document.forms.length === 0"));
      expect(posts.at(-1)!.status).toBe(403); expect(posts.at(-1)!.headers.get("Location")).toBeNull();
      expect(posts.at(-1)!.headers.get("Cache-Control")).toContain("no-store"); expect(outbound).toHaveLength(index + 1);
    }
    expect(outbound).toEqual(product.destinations.map(d => d.destination_url)); expect(f.records.size).toBe(0);
    expect(f.costs).toEqual(["32", "3", "3", "3", "3"]); expect(failures).toEqual([]);
  } finally { await browser.close(); }
});


it("real Chromium retains recognition without any marketplace form when intents are unavailable", async () => {
  const html = await documentHtml({ confirmation: product, intents: [] });
  const browser = await chromiumFixture(); const unexpected: string[] = [];
  try {
    browser.on("Fetch.requestPaused", value => {
      const paused = value as Paused;
      void (async () => {
        let response: Response;
        if (paused.request.method === "GET" && paused.request.url === `${origin}/creator/spill/27`) {
          response = new Response(html, { headers: { "content-type": "text/html" } });
        } else if (paused.request.method === "GET" && paused.request.url === `${origin}${product.primary_image_path}`) {
          response = new Response(null, { status: 204 });
        } else if (paused.request.method === "GET" && paused.request.url === `${origin}/favicon.ico`) {
          response = new Response(null, { status: 204 });
        } else { unexpected.push(`${paused.request.method} ${paused.request.url}`);
          await browser.command("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }); return; }
        await browser.command("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: response.status,
          responseHeaders: [...response.headers].map(([name, value]) => ({ name, value })),
          body: Buffer.from(await response.arrayBuffer()).toString("base64") });
      })().catch(error => unexpected.push(String(error)));
    });
    await browser.command("Runtime.enable"); await browser.command("Page.enable");
    await browser.command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await browser.command("Page.navigate", { url: `${origin}/creator/spill/27` });
    await until(() => browser.evaluate<boolean>("document.readyState === 'complete' && Boolean(document.querySelector('h1'))"));
    const recognition = await browser.evaluate<{ title: string; text: string; forms: number; buttons: number; links: string[] }>(`({
      title: document.querySelector('h1').textContent, text: document.body.innerText,
      forms: document.forms.length, buttons: document.querySelectorAll('button').length,
      links: [...document.querySelectorAll('a')].map(a => a.href) })`);
    expect(recognition.title).toBe(product.title); expect(recognition.text).toContain(product.display_name);
    expect(recognition.text).toContain("Marketplace destinations are temporarily unavailable.");
    expect(recognition.forms).toBe(0); expect(recognition.buttons).toBe(0);
    expect(recognition.links).toEqual([`${origin}/creator`, `${origin}/creator/spill`]);
    expect(unexpected).toEqual([]);
  } finally { await browser.close(); }
});
