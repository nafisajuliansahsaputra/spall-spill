import { afterEach, describe, expect, it, vi } from "vitest";
import { readResourceOpenRequest as read, resourceOpenNoStoreHeaders, unavailableResourceOpenResponse } from "./resource-open-request";

const origin = "https://app.example.test";
const issue = { handle: "OLD-HANDLE", reference: "#27" };
const redeem = { handle: "CREATOR", spill_reference: 27, token: "A".repeat(43) };
const allow = () => Promise.resolve(true);
function request(body: BodyInit = JSON.stringify(issue), headers: Record<string, string | null> = {}, init: RequestInit = {}) {
  const h = new Headers({ origin, "content-type": "application/json" });
  for (const [key, value] of Object.entries(headers)) { if (value === null) h.delete(key); else h.set(key, value); }
  return new Request(`${origin}/staged-resource-action`, { method: "POST", body, headers: h, duplex: "half", ...init } as RequestInit);
}
afterEach(() => vi.useRealTimers());
describe("private Resource Open JSON request boundary", () => {
  it("normalizes issue/reference and redeem Handle after exact server-selected permit", async () => {
    const permit = vi.fn(allow); const first = request();
    expect(await read(first, origin, "issue", permit)).toEqual({ handle: "old-handle", reference: "27" });
    expect(permit).toHaveBeenCalledExactlyOnceWith(first, "issue");
    const second = request(JSON.stringify(redeem), { "content-type": "application/json; charset=UTF-8" });
    expect(await read(second, origin, "redeem", permit)).toEqual({ ...redeem, handle: "creator" });
    expect(permit).toHaveBeenLastCalledWith(second, "redeem");
  });
  it.each([null, {}, [], 27, { ...issue, reference: 27 }, { ...issue, reference: "027" },
    { ...issue, reference: "0" }, { ...issue, reference: "9007199254740992" }, { ...issue, handle: "../creator" },
    { ...issue, provider_key: "shopee" }, { ...issue, source_url: "https://forged.test" },
    { ...issue, token: redeem.token }, { ...issue, binding: {} }, { ...issue, owner_id: "private" },
    { ...issue, publication_token: "a".repeat(64) }, { ...issue, action: "redeem" },
  ])("rejects non-exact or browser-supplied issue authority %j", async input => {
    expect(await read(request(JSON.stringify(input)), origin, "issue", allow)).toBeNull();
  });
  it.each([null, {}, issue, { ...redeem, spill_reference: "27" }, { ...redeem, spill_reference: 0 },
    { ...redeem, spill_reference: 1.5 }, { ...redeem, spill_reference: 9007199254740992 },
    { ...redeem, token: "bad" }, { ...redeem, token: "A".repeat(42) + "B" },
    { ...redeem, provider_key: "shopee" }, { ...redeem, source_url: "https://forged.test" },
    { ...redeem, input_record: {} }, { ...redeem, source_hash: "a".repeat(64) },
  ])("rejects noncanonical redemption or private authority %j", async input => {
    expect(await read(request(JSON.stringify(input)), origin, "redeem", allow)).toBeNull();
  });
  it.each([{ origin: null }, { origin: "https://evil.test" }, { host: "evil.test" },
    { "sec-fetch-site": "cross-site" }, { "content-type": "application/x-www-form-urlencoded" },
    { "content-type": "application/json;charset=latin1" }, { "content-encoding": "gzip" },
    { "content-length": "4097" }, { "content-length": "01" },
  ])("rejects preflight before permit %j", async headers => {
    const permit = vi.fn(allow); expect(await read(request(undefined, headers), origin, "issue", permit)).toBeNull();
    expect(permit).not.toHaveBeenCalled();
  });
  it.each([`${origin}/`, "http://app.example.test", "https://user@app.example.test"])("rejects noncanonical origin configuration %s", async configured => {
    const permit = vi.fn(allow); expect(await read(request(), configured, "issue", permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it("rejects hostile URL/query despite Forwarded headers and unsupported server action", async () => {
    const permit = vi.fn(allow);
    for (const url of ["https://evil.test/action", `${origin}/action?source=forged`, `${origin}/action#fragment`]) {
      const r = new Request(url, { method: "POST", body: JSON.stringify(issue), headers: { origin,
        "content-type": "application/json", forwarded: "host=app.example.test;proto=https" } });
      expect(await read(r, origin, "issue", permit)).toBeNull();
    }
    expect(await read(request(), origin, "bundle" as "issue", permit)).toBeNull();
    expect(await read(new Request(`${origin}/action`), origin, "issue", permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it.each([false, null, undefined, 1, "true", {}])("requires literal true permit %j", async value => {
    expect(await read(request(), origin, "issue", async () => value)).toBeNull();
  });
  it("denies thrown permit once and does not begin body reading", async () => {
    const permit = vi.fn(async () => { throw new Error("private"); });
    const r = request(); expect(await read(r, origin, "issue", permit)).toBeNull();
    expect(permit).toHaveBeenCalledTimes(1); expect(r.bodyUsed).toBe(false);
  });
  it("enforces UTF-8 actual bytes, declared equality and exact maximum", async () => {
    const text = JSON.stringify({ handle: "creator", reference: "27" });
    const padded = text + " ".repeat(4096 - text.length);
    expect(await read(request(padded, { "content-length": "4096" }), origin, "issue", allow)).toEqual({ handle: "creator", reference: "27" });
    expect(await read(request(padded + " "), origin, "issue", allow)).toBeNull();
    expect(await read(request(text, { "content-length": String(text.length - 1) }), origin, "issue", allow)).toBeNull();
    expect(await read(request(JSON.stringify({ ...issue, extra: "é".repeat(2048) })), origin, "issue", allow)).toBeNull();
    expect(await read(request(new Uint8Array([34, 255, 34])), origin, "issue", allow)).toBeNull();
  });
  it.each(["", "null", "{", '{"handle":'])("denies malformed/empty JSON %j", async text => {
    expect(await read(request(text), origin, "issue", allow)).toBeNull();
  });
  it("bounds endless empty chunks and cancels streamed overflow", async () => {
    for (const empty of [true, false]) {
      const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(empty ? 0 : 4097)); }, cancel });
      expect(await read(request(body), origin, "issue", allow)).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
    }
  });
  it.each(["permit", "body"])("bounds hanging %s and ignores late completion", async kind => {
    vi.useFakeTimers(); let finish!: (value: boolean) => void;
    const cancel = vi.fn(); const pending = read(request(kind === "body" ? new ReadableStream<Uint8Array>({ cancel }) : undefined), origin,
      "issue", kind === "permit" ? () => new Promise(resolve => { finish = resolve; }) : allow);
    await vi.advanceTimersByTimeAsync(5000); expect(await pending).toBeNull();
    if (kind === "body") expect(cancel).toHaveBeenCalledTimes(1);
    else { finish(true); await vi.advanceTimersByTimeAsync(0); expect(await pending).toBeNull(); }
  });
  it("denies stream error/pre-abort without leaking or calling permit", async () => {
    expect(await read(request(new ReadableStream({ start(c) { c.error(new Error("private")); } })), origin, "issue", allow)).toBeNull();
    const controller = new AbortController(); controller.abort(); const permit = vi.fn(allow);
    expect(await read(request(undefined, {}, { signal: controller.signal }), origin, "issue", permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it("returns fresh no-store generic denial without Location/CORS/private detail", async () => {
    const h = resourceOpenNoStoreHeaders(); h.set("Cache-Control", "public"); const response = unavailableResourceOpenResponse();
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ status: "unavailable" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Pragma")).toBe("no-cache"); expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.has("Location")).toBe(false); expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
  });
});
