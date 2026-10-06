import { describe, expect, it, vi } from "vitest";
import { readProductClickRequest, productClickNoStoreHeaders, unavailableProductClickResponse } from "./product-click-request";

const origin = "https://app.example.test";
function request(headers: Record<string, string | null> = {}, body: BodyInit = '{"handle":"creator","spill_reference":27}', init: RequestInit = {}) {
  const h = new Headers({ origin, "content-type": "application/json" });
  for (const [key, value] of Object.entries(headers)) { if (value === null) h.delete(key); else h.set(key, value); }
  return new Request(`${origin}/private-staged-action`, { method: "POST", body, headers: h, duplex: "half", ...init } as RequestInit);
}
const allow = () => Promise.resolve(true);
describe("unmounted Product click request boundary", () => {
  it("accepts bounded same-origin JSON after one server-selected permit", async () => {
    const permit = vi.fn(allow);
    expect(await readProductClickRequest(request({ host: "app.example.test", "sec-fetch-site": "same-origin" }), origin, "issue", permit))
      .toEqual({ handle: "creator", spill_reference: 27 });
    expect(permit).toHaveBeenCalledExactlyOnceWith("issue");
    expect(await readProductClickRequest(request({ "content-type": "application/json; charset=UTF-8" }), origin, "redeem", allow)).not.toBeNull();
  });
  it.each([null, "null", "https://evil.example.test", `${origin}/`, "http://app.example.test"])("denies untrusted Origin %j before permit", async (value) => {
    const permit = vi.fn(allow); expect(await readProductClickRequest(request({ origin: value }), origin, "issue", permit)).toBeNull();
    expect(permit).not.toHaveBeenCalled();
  });
  it.each(["http://app.example.test", `${origin}/`, `${origin}/path`, `${origin}?x=1`, "https://user@app.example.test", "bad"])("denies noncanonical trusted config %s", async (config) => {
    const permit = vi.fn(allow); expect(await readProductClickRequest(request(), config, "issue", permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it.each([{ host: "evil.test" }, { "sec-fetch-site": "cross-site" }, { "content-type": "text/plain" },
    { "content-type": "application/json;charset=latin1" }, { "content-encoding": "gzip" }, { "content-length": "4097" },
    { "content-length": "-1" }, { "content-length": "1.5" }, { "content-length": "01" }, { "content-length": "9999999999" },
  ])("denies preflight headers %j without permit", async (headers) => {
    const permit = vi.fn(allow); expect(await readProductClickRequest(request(headers), origin, "issue", permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it("does not trust Forwarded/X-Forwarded headers to repair a hostile URL/Origin", async () => {
    const r = new Request("https://evil.test/action", { method: "POST", body: "{}", headers: { origin,
      "content-type": "application/json", forwarded: "host=app.example.test;proto=https", "x-forwarded-host": "app.example.test" } });
    expect(await readProductClickRequest(r, origin, "issue", allow)).toBeNull();
  });
  it.each(["?url=https://evil.test", "#fragment"])("denies URL authority extras %s", async (suffix) => {
    const r = new Request(`${origin}/action${suffix}`, { method: "POST", body: "{}", headers: { origin, "content-type": "application/json" } });
    expect(await readProductClickRequest(r, origin, "issue", allow)).toBeNull();
  });
  it("rejects GET and unsupported server action", async () => {
    expect(await readProductClickRequest(new Request(`${origin}/action`), origin, "issue", allow)).toBeNull();
    expect(await readProductClickRequest(request(), origin, "other" as "issue", allow)).toBeNull();
  });
  it.each([false, null, undefined, 1, "true", {}])("requires literal permit acknowledgment %j", async (value) => {
    expect(await readProductClickRequest(request(), origin, "issue", async () => value)).toBeNull();
  });
  it("denies permit error without retry", async () => {
    const permit = vi.fn(async () => { throw new Error("private provider detail"); });
    expect(await readProductClickRequest(request(), origin, "issue", permit)).toBeNull(); expect(permit).toHaveBeenCalledTimes(1);
  });
  it.each(["", "null", "{", '{"bad":', '"'+"x".repeat(4095)+'"'])("denies invalid/null/oversized body %j", async (body) => {
    expect(await readProductClickRequest(request({}, body), origin, "issue", allow)).toBeNull();
  });
  it("counts actual UTF-8 bytes and requires declared equality", async () => {
    const text = '"é"'; expect(new TextEncoder().encode(text).length).toBe(4);
    expect(await readProductClickRequest(request({ "content-length": "4" }, text), origin, "issue", allow)).toBe("é");
    expect(await readProductClickRequest(request({ "content-length": "3" }, text), origin, "issue", allow)).toBeNull();
    expect(await readProductClickRequest(request({}, '"'+"é".repeat(2048)+'"'), origin, "issue", allow)).toBeNull();
    expect(await readProductClickRequest(request({}, '"'+"x".repeat(4094)+'"'), origin, "issue", allow)).toBe("x".repeat(4094));
  });
  it("denies invalid UTF-8 and streamed overflow while cancelling", async () => {
    expect(await readProductClickRequest(request({}, new Uint8Array([34,255,34])), origin, "issue", allow)).toBeNull();
    const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4096)); c.enqueue(new Uint8Array(1)); }, cancel });
    expect(await readProductClickRequest(request({}, body), origin, "issue", allow)).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("bounds empty-chunk framing without relying on timer scheduling", async () => {
    const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array()); }, cancel });
    expect(await readProductClickRequest(request({}, body), origin, "issue", allow)).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("fails closed on stream error and pre-aborted request", async () => {
    const body = new ReadableStream({ start(c) { c.error(new Error("private")); } });
    expect(await readProductClickRequest(request({}, body), origin, "issue", allow)).toBeNull();
    const controller = new AbortController(); controller.abort(); const permit = vi.fn(allow);
    expect(await readProductClickRequest(request({}, "{}", { signal: controller.signal }), origin, "issue", permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it.each(["permit", "body"])("bounds hanging %s within five seconds", async (kind) => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(); const body = kind === "body" ? new ReadableStream<Uint8Array>({ cancel }) : "{}";
      const result = readProductClickRequest(request({}, body), origin, "issue", kind === "permit" ? () => new Promise(() => {}) : allow);
      await vi.advanceTimersByTimeAsync(5000); expect(await result).toBeNull();
      if (kind === "body") expect(cancel).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("returns fresh no-store headers and generic denial without redirect/CORS/private detail", async () => {
    const h = productClickNoStoreHeaders(); h.set("Cache-Control", "public");
    const response = unavailableProductClickResponse(); expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.has("Location")).toBe(false); expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
