import { afterEach, describe, expect, it, vi } from "vitest";
import { readResourceOpenFormRequest as readForm, readResourceOpenRequest } from "./resource-open-request";

const origin = "https://app.example.test";
const fields = { handle: "CREATOR", spill_reference: "27", token: "A".repeat(43) };
const expected = { ...fields, handle: "creator", spill_reference: 27 };
const encoded = new URLSearchParams(fields).toString();
function request(body: BodyInit = encoded, headers: Record<string, string> = {}, init: RequestInit = {}) {
  return new Request(`${origin}/private-native-action`, { method: "POST", headers: { origin,
    "content-type": "application/x-www-form-urlencoded", ...headers }, body, duplex: "half", ...init } as RequestInit);
}
const allow = () => Promise.resolve(true);
const read = (r: Request, permit: (request: Request, action: "issue" | "redeem") => Promise<unknown> = allow) => readForm(r, origin, permit);
afterEach(() => vi.useRealTimers());
describe("strict native Resource redemption request", () => {
  it("parses browser encoding, normalizes Handle and selects redeem on the same Request", async () => {
    const permit = vi.fn(allow); const r = request(encoded, { "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" });
    expect(await read(r, permit)).toEqual(expected); expect(permit).toHaveBeenCalledExactlyOnceWith(r, "redeem");
    expect(await read(request(encoded, { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }))).toEqual(expected);
    expect(await read(request(encoded.replace("handle=CREATOR", "%68andle=%43REATOR")))).toEqual(expected);
    expect(await read(request(encoded.replace("spill_reference=27", "spill_reference=9007199254740991"))))
      .toEqual({ ...expected, spill_reference: Number.MAX_SAFE_INTEGER });
  });
  it.each(["", encoded + "&", encoded + "&provider_key=shopee", encoded + "&source_url=https%3A%2F%2Fevil.test",
    encoded.replace("handle=CREATOR", "handle="), encoded.replace("handle=CREATOR", "handle"),
    encoded.replace("handle=CREATOR", "handle=a=b"), encoded.replace("handle=CREATOR", "handle=hello+world"),
    encoded.replace("handle=CREATOR", "handle=cr%C3%A9ator"), encoded.replace("handle=CREATOR", "handle=a%26b%3Dc"),
    encoded.replace("handle=CREATOR", "handle=%"), encoded.replace("handle=CREATOR", "handle=%GG"),
    encoded.replace("handle=CREATOR", "handle=%C3"), encoded.replace("handle=CREATOR", "handle=%FF"),
    encoded.replace("token=", "handle="), encoded.replace("token=", "%68andle="),
    encoded.replace("token=", "provider_key="), encoded.replace("token=", "source_url="),
    encoded.replace("token=", "binding="), encoded.replace("token=", "input_record="),
    encoded.replace("token=", "owner_id="), encoded.replace("token=", "__proto__="),
  ])("denies ambiguous/private/Product/invalid encoding %j", async body => { expect(await read(request(body))).toBeNull(); });
  it.each(["0", "027", "-1", "+27", "27.0", "2.7e1", " 27", "27 ", "#27", "9007199254740992", "99999999999999999"])
    ("denies noncanonical native reference %s", async reference => {
      expect(await read(request(new URLSearchParams({ ...fields, spill_reference: reference }).toString()))).toBeNull();
    });
  it.each(["bad", "A".repeat(42) + "B", "A".repeat(44), "A".repeat(42) + "%", ""])("requires canonical opaque token %j", async token => {
    expect(await read(request(new URLSearchParams({ ...fields, token }).toString()))).toBeNull();
  });
  it.each([{ origin: "https://evil.test" }, { host: "evil.test" }, { "sec-fetch-site": "cross-site" },
    { "sec-fetch-mode": "cors" }, { "sec-fetch-dest": "iframe" }, { "content-encoding": "gzip" },
    { "content-type": "application/json" }, { "content-type": "multipart/form-data; boundary=x" },
    { "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded; charset=latin1" },
    { "content-length": "4097" }, { "content-length": "01" }])("rejects preflight before permit %j", async headers => {
    const permit = vi.fn(allow); expect(await read(request(encoded, headers), permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it.each([`${origin}/`, "http://app.example.test", "https://user@app.example.test"])("requires canonical configured origin %s", async configured => {
    const permit = vi.fn(allow); expect(await readForm(request(), configured, permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it("rejects hostile URL or missing Origin despite Forwarded claims and denies GET", async () => {
    const permit = vi.fn(allow);
    for (const url of ["https://evil.test/action", `${origin}/action?source=forged`, `${origin}/action#fragment`]) {
      const r = new Request(url, { method: "POST", body: encoded, headers: { origin,
        "content-type": "application/x-www-form-urlencoded", forwarded: "host=app.example.test;proto=https" } });
      expect(await read(r, permit)).toBeNull();
    }
    const missing = request(); missing.headers.delete("origin"); expect(await read(missing, permit)).toBeNull();
    expect(await read(new Request(`${origin}/action`), permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it("keeps native and JSON media policies separate", async () => {
    expect(await readResourceOpenRequest(request(), origin, "redeem", allow)).toBeNull();
    expect(await readResourceOpenRequest(request(), origin, "issue", allow)).toBeNull();
    expect(await read(request(JSON.stringify(expected), { "content-type": "application/json" }))).toBeNull();
    expect(await readResourceOpenRequest(request(JSON.stringify(expected), { "content-type": "application/json" }), origin, "redeem", allow)).toEqual(expected);
  });
  it("bounds encoded actual bytes/equality, invalid UTF-8, overflow and empty chunk reads", async () => {
    expect(await read(request(encoded, { "content-length": String(encoded.length) }))).toEqual(expected);
    expect(await read(request(encoded, { "content-length": String(encoded.length - 1) }))).toBeNull();
    expect(await read(request(new Uint8Array([255])))).toBeNull();
    for (const oversized of [false, true]) {
      const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ pull(c) { c.enqueue(new Uint8Array(oversized ? 4097 : 0)); }, cancel });
      expect(await read(request(stream))).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
    }
  });
  it.each([false, null, undefined, 1, "true", {}])("requires literal true permit without reading %j", async value => {
    const r = request(); expect(await read(r, async () => value)).toBeNull(); expect(r.bodyUsed).toBe(false);
  });
  it("denies thrown permit and pre-abort without body reading", async () => {
    const r = request(); const permit = vi.fn(async () => { throw new Error("private"); });
    expect(await read(r, permit)).toBeNull(); expect(r.bodyUsed).toBe(false); expect(permit).toHaveBeenCalledTimes(1);
    const controller = new AbortController(); controller.abort(); const unused = vi.fn(allow);
    expect(await read(request(encoded, {}, { signal: controller.signal }), unused)).toBeNull(); expect(unused).not.toHaveBeenCalled();
  });
  it.each(["permit", "body"])("bounds hanging %s and ignores late completion", async kind => {
    vi.useFakeTimers(); let finish!: () => void; const cancel = vi.fn();
    const r = request(kind === "body" ? new ReadableStream<Uint8Array>({ cancel }) : encoded);
    const permit = kind === "permit" ? () => new Promise<boolean>(resolve => { finish = () => resolve(true); }) : allow;
    const pending = read(r, permit); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toBeNull();
    if (kind === "body") expect(cancel).toHaveBeenCalledTimes(1); else { finish(); await vi.advanceTimersByTimeAsync(0); expect(r.bodyUsed).toBe(false); }
    expect(await pending).toBeNull();
  });
  it("denies stream errors and returns without waiting for stalled cancellation", async () => {
    const failed = new ReadableStream<Uint8Array>({ start(c) { c.error(new Error("private")); } });
    expect(await read(request(failed))).toBeNull();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const oversized = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4097)); }, cancel });
    expect(await read(request(oversized))).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
  });
});
