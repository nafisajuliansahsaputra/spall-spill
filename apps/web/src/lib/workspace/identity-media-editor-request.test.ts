import { afterEach, expect, it, vi } from "vitest";
import { identityMediaEditorMaximumBodyBytes, isIdentityMediaEditorRequestAdmitted as admit } from "./identity-media-editor-request";

import { identityMediaEditorCommandSchema } from "./identity-media-editor-command";
import { identityLinkEditorMaximumBodyBytes } from "./identity-link-editor-request";
import { identityContactEditorMaximumBodyBytes } from "./identity-contact-editor-request";
import { identityTextEditorMaximumBodyBytes } from "./identity-text-editor-request";

afterEach(() => vi.restoreAllMocks());
const origin = "https://editor.example.test";
function request(overrides: { url?: string; method?: string; headers?: Record<string, string | null>; body?: string | null; signal?: AbortSignal } = {}) {
  const headers = new Headers({ origin, host: "editor.example.test", "content-type": "application/json" });
  for (const [key, value] of Object.entries(overrides.headers ?? {})) {
    if (value === null) headers.delete(key); else headers.set(key, value);
  }
  return new Request(overrides.url ?? `${origin}/private-fixture`, {
    method: overrides.method ?? "POST", headers, body: overrides.body === undefined ? "{}" : overrides.body,
    ...(overrides.signal ? { signal: overrides.signal } : {}),
  });
}
it("admits metadata without consuming, locking or decoding the body", async () => {
  const r = request({ body: "not JSON" }); expect(admit(r, origin)).toBe(true);
  expect(r.bodyUsed).toBe(false); expect(r.body!.locked).toBe(false); expect(await r.text()).toBe("not JSON");
});
it.each(["https://editor.example.test", "https://editor.example.test:8443", "https://[2001:db8::1]:8443"])("admits exact canonical HTTPS origin %s", value => {
  const r = request({ url: `${value}/fixture`, headers: { origin: value, host: new URL(value).host } }); expect(admit(r, value)).toBe(true);
});
it.each(["", "null", "http://editor.example.test", `${origin}/`, `${origin}/path`, `${origin}?x=1`, `${origin}#fragment`,
  "https://u:p@editor.example.test", "https://EDITOR.example.test", "https://editor.example.test:443", " https://editor.example.test",
])("rejects noncanonical trusted config %s", value => { expect(admit(request(), value)).toBe(false); });
it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])("rejects %s", method => {
  expect(admit(request({ method, ...(method === "GET" || method === "HEAD" ? { body: null } : {}) }), origin)).toBe(false);
});
it.each([null, "null", "https://other.example.test", `${origin}:8443`, `${origin}.evil.test`, "https://editor.example.test.", `${origin}, ${origin}`, `${origin}/`])("rejects Origin %j", value => {
  expect(admit(request({ headers: { origin: value } }), origin)).toBe(false);
});
it.each([null, "other.example.test", "editor.example.test:8443", "editor.example.test.", "EDITOR.example.test", "editor.example.test, editor.example.test"])("rejects Host %j", host => {
  expect(admit(request({ headers: { host } }), origin)).toBe(false);
});
it.each(["http://editor.example.test/x", "https://other.example.test/x", `${origin}:8443/x`, `${origin}/x?q=1`, `${origin}/x#fragment`, `${origin}/x?`, `${origin}/x#`])("rejects URL %s", url => {
  expect(admit(request({ url }), origin)).toBe(false);
});
it.each(["application/json", "application/json;charset=utf-8", "APPLICATION/JSON; CHARSET=UTF-8"])("admits exact JSON media %s", type => {
  expect(admit(request({ headers: { "content-type": type } }), origin)).toBe(true);
});
it.each([null, "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/json; charset=latin1", "application/json; charset=utf-8; x=1", "application/json, application/json"])("rejects media %j", type => {
  expect(admit(request({ headers: { "content-type": type } }), origin)).toBe(false);
});
it.each(["gzip", "br", "identity, gzip", "IDENTITY", ""])("rejects encoding %j", encoding => {
  expect(admit(request({ headers: { "content-encoding": encoding } }), origin)).toBe(false);
});
it.each(["chunked", "gzip", ""])("rejects Transfer-Encoding %j", value => {
  expect(admit(request({ headers: { "transfer-encoding": value } }), origin)).toBe(false);
});
it.each([
  ["sec-fetch-site", "cross-site"], ["sec-fetch-site", "same-site"], ["sec-fetch-site", "none"],
  ["sec-fetch-mode", "navigate"], ["sec-fetch-mode", "no-cors"], ["sec-fetch-mode", "websocket"],
  ["sec-fetch-dest", "document"], ["sec-fetch-dest", "iframe"], ["sec-fetch-dest", "script"],
  ["sec-fetch-dest", "Empty"], ["sec-fetch-dest", "EMPTY"], ["sec-fetch-dest", "empty, empty"], ["sec-fetch-dest", "empty, document"],
])("rejects conflicting browser hint %s=%s", (key, value) => {
  expect(admit(request({ headers: { [key]: value } }), origin)).toBe(false);
});
it.each(["cors", "same-origin"])("admits consistent fetch metadata %s", mode => {
  expect(admit(request({ headers: { "sec-fetch-site": "same-origin", "sec-fetch-mode": mode, "sec-fetch-dest": "", "content-encoding": "identity" } }), origin)).toBe(true);
});
it.each(["cors", "same-origin"])("admits actual browser empty destination token with %s", mode => {
  const r = request({ headers: { "sec-fetch-site": "same-origin", "sec-fetch-mode": mode, "sec-fetch-dest": "empty" } });
  expect(admit(r, origin)).toBe(true); expect(r.bodyUsed).toBe(false); expect(r.body!.locked).toBe(false);
  r.headers.set("origin", "https://evil.test"); expect(admit(r, origin)).toBe(false);
  r.headers.set("origin", origin); r.headers.set("sec-fetch-site", "same-site"); expect(admit(r, origin)).toBe(false);
});
it.each([null, "0", "1", "32768"])("admits canonical declared length %j without trusting actual bytes", length => {
  expect(admit(request({ headers: { "content-length": length }, body: "not even JSON" }), origin)).toBe(true);
});
it.each(["32769", "100000", "99999", "01", "+1", "-1", "1.0", "1e2", "1, 1", "", "Infinity"])("rejects declared length %j", length => {
  expect(admit(request({ headers: { "content-length": length } }), origin)).toBe(false);
});
it("never lets forwarded headers repair rejected Host/Origin/URL", () => {
  const forwarded = { forwarded: 'host=editor.example.test;proto=https', "x-forwarded-host": "editor.example.test", "x-forwarded-proto": "https", "x-forwarded-for": "127.0.0.1" };
  expect(admit(request({ headers: forwarded }), origin)).toBe(true);
  expect(admit(request({ headers: { ...forwarded, host: "evil.test" } }), origin)).toBe(false);
  expect(admit(request({ headers: { ...forwarded, origin: "https://evil.test" } }), origin)).toBe(false);
  expect(admit(request({ headers: forwarded, url: "https://evil.test/fixture" }), origin)).toBe(false);
});
it("rejects an aborted, missing, consumed or locked body without reading again", async () => {
  const controller = new AbortController(); controller.abort();
  expect(admit(request({ signal: controller.signal }), origin)).toBe(false);
  expect(admit(request({ body: null }), origin)).toBe(false);
  const consumed = request(); await consumed.text(); expect(admit(consumed, origin)).toBe(false);
  const locked = request(), reader = locked.body!.getReader(); expect(admit(locked, origin)).toBe(false);
  expect(locked.bodyUsed).toBe(false); reader.releaseLock(); expect(await locked.text()).toBe("{}");
});
it("does not pull or cancel a caller-owned stream", async () => {
  let reads = 0, cancels = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array([123, 125])); controller.close(); }, cancel() { cancels++; } }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: string } = { method: "POST", headers: { origin, host: "editor.example.test", "content-type": "application/json" }, body: stream, duplex: "half" };
  const r = new Request(`${origin}/fixture`, init); expect(admit(r, origin)).toBe(true);
  expect(reads).toBe(0); expect(cancels).toBe(0); expect(await r.text()).toBe("{}"); expect(reads).toBe(1);
});
it("does not clone, read, lock, cancel or invoke fetch while observing metadata", () => {
  const r = request(), clone = vi.spyOn(r, "clone"), text = vi.spyOn(r, "text"), json = vi.spyOn(r, "json");
  const reader = vi.spyOn(r.body!, "getReader"), cancel = vi.spyOn(r.body!, "cancel");
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected I/O"));
  expect(admit(r, origin)).toBe(true); r.headers.set("origin", "https://evil.test"); expect(admit(r, origin)).toBe(false);
  for (const spy of [clone, text, json, reader, cancel, fetcher]) expect(spy).not.toHaveBeenCalled();
});
it.each(["origin", "host", "content-type", "content-length", "content-encoding", "transfer-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest"])("rechecks changed %s instead of caching an earlier permit", header => {
  const r = request(); expect(admit(r, origin)).toBe(true);
  r.headers.set(header, "forged"); expect(admit(r, origin)).toBe(false);
});
it("keeps the separate Link and Text byte ceilings unchanged", () => {
  expect(identityContactEditorMaximumBodyBytes).toBe(32768); expect(identityLinkEditorMaximumBodyBytes).toBe(32768); expect(identityMediaEditorMaximumBodyBytes).toBe(32768); expect(identityTextEditorMaximumBodyBytes).toBe(262144);
});
const actions = ["add_media_block", "initialize_media_block", "save_media_block"] as const;
it.each(actions)("fits maximal escaped Media for %s", action => {
  for (const escape of ['\\ud83d\\ude00', '\\u0001', '\\uffff', '\\ud800']) {
    const target = action === "save_media_block" ? ',"block_id":"90000000-0000-4000-8000-000000000003"' : ',"is_visible":false';
    const base = action === "initialize_media_block" ? "null" : String(Number.MAX_SAFE_INTEGER);
    const body = '{"action":"' + action + '","base_collection_revision":' + base + target
      + ',"media_working":{"kind":"media","asset_key":"ABCDEF00-0000-4000-8000-000000000003","alt_text":"' + escape.repeat(2048) + '"}}';
    const count = Buffer.byteLength(body), command = JSON.parse(body);
    expect(Array.from(command.media_working.alt_text)).toHaveLength(2048);
    expect(identityMediaEditorCommandSchema.safeParse(command).success).toBe(true);
    expect(count).toBeLessThan(identityMediaEditorMaximumBodyBytes);
    if (escape === '\\ud83d\\ude00') expect(count).toBeGreaterThan(24576);
    const r = request({ body, headers: { "content-length": String(count) } });
    expect(admit(r, origin)).toBe(true); expect(r.bodyUsed).toBe(false); expect(r.body!.locked).toBe(false);
  }
});
it.each(actions)("retains nullable/raw Media commands for %s", action => {
  for (const asset_key of [null, "ABCDEF00-0000-4000-8000-000000000003"]) {
    for (const alt_text of [null, "", " <script>raw()</script> \r\n e\u0301🐈 "]) {
      for (const is_visible of [false, true]) {
        const command = { action, base_collection_revision: action === "initialize_media_block" ? null : 1,
          ...(action === "save_media_block" ? { block_id: "90000000-0000-4000-8000-000000000003" } : { is_visible }),
          media_working: { kind: "media", asset_key, alt_text } };
        expect(identityMediaEditorCommandSchema.safeParse(command).success).toBe(true);
        expect(admit(request({ body: JSON.stringify(command) }), origin)).toBe(true);
      }
    }
  }
});
it.each([null, "0", "1"])("does not mistake declared size %j for actual byte enforcement", async length => {
  const body = "x".repeat(identityMediaEditorMaximumBodyBytes + 1);
  const r = request({ body, headers: { "content-length": length } });
  expect(admit(r, origin)).toBe(true); expect(r.bodyUsed).toBe(false);
  expect(Buffer.byteLength(await r.text())).toBe(identityMediaEditorMaximumBodyBytes + 1);
});
it("keeps strict command validity separate from metadata admission", () => {
  for (const body of ["not JSON", "{}", JSON.stringify({ action: "publish", owner_id: "forged" })]) {
    expect(admit(request({ body }), origin)).toBe(true);
  }
  expect(identityMediaEditorCommandSchema.safeParse({ action: "publish", owner_id: "forged" }).success).toBe(false);
});
