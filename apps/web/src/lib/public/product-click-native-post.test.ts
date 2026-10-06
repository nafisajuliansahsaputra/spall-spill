import { describe, expect, it, vi } from "vitest";
import { readProductClickFormRequest, readProductClickRequest } from "./product-click-request";

const origin = "https://app.example.test";
const fields = { handle: "creator", spill_reference: "27", provider_key: "shopee", token: "A".repeat(43) };
const encoded = new URLSearchParams(fields).toString();
function request(body: BodyInit = encoded, headers: Record<string, string> = {}, init: RequestInit = {}) {
  return new Request(`${origin}/private-native-action`, { method: "POST", headers: { origin,
    "content-type": "application/x-www-form-urlencoded", ...headers }, body, duplex: "half", ...init } as RequestInit);
}
const allow = () => Promise.resolve(true);
const read = (r: Request, permit = allow) => readProductClickFormRequest(r, origin, permit);
describe("strict native Product redemption request", () => {
  it("parses browser encoding after a single server-selected redeem permit", async () => {
    const permit = vi.fn(allow);
    expect(await read(request(encoded, { "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" }), permit))
      .toEqual({ ...fields, spill_reference: 27 });
    expect(permit).toHaveBeenCalledExactlyOnceWith("redeem");
    expect(await read(request(encoded, { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" }))).not.toBeNull();
  });
  it("strictly decodes escaped names, values and plus-as-space without early field splitting", async () => {
    const body = encoded.replace("handle=creator", "%68andle=cr%C3%A9ator").replace("provider_key=shopee", "provider_key=external%3Ashop.example");
    expect(await read(request(body))).toEqual({ ...fields, handle: "créator", spill_reference: 27, provider_key: "external:shop.example" });
    expect(await read(request(encoded.replace("handle=creator", "handle=hello+world")))).toEqual({ ...fields, handle: "hello world", spill_reference: 27 });
  });
  it.each(["", encoded+"&", encoded+"&owner_id=forged", encoded.replace("provider_key=shopee", "handle=other"),
    encoded.replace("provider_key=shopee", "%68andle=other"), encoded.replace("handle=creator", "handle="),
    encoded.replace("handle=creator", "handle"), encoded.replace("handle=creator", "handle=a=b"),
    encoded.replace("handle=creator", "destination_url=https%3A%2F%2Fevil.test"),
    encoded.replace("handle=creator", "__proto__=forged"), encoded.replace("handle=creator", "handle=%"),
    encoded.replace("handle=creator", "handle=%GG"), encoded.replace("handle=creator", "handle=%C3"),
    encoded.replace("handle=creator", "handle=%FF"),
  ])("denies ambiguous/private/malformed form %j", async body => { expect(await read(request(body))).toBeNull(); });
  it.each(["0", "027", "-1", "+27", "27.0", "2.7e1", " 27", "27 ", "9007199254740992", "99999999999999999"])
    ("denies noncanonical reference %s", async reference => {
      expect(await read(request(new URLSearchParams({ ...fields, spill_reference: reference }).toString()))).toBeNull();
    });
  it("accepts the existing maximum safe integer reference", async () => {
    expect(await read(request(encoded.replace("spill_reference=27", "spill_reference=9007199254740991"))))
      .toEqual({ ...fields, spill_reference: Number.MAX_SAFE_INTEGER });
  });
  it.each([{ origin: "https://evil.test" }, { host: "evil.test" }, { "sec-fetch-site": "cross-site" },
    { "sec-fetch-mode": "cors" }, { "sec-fetch-dest": "iframe" }, { "content-encoding": "gzip" },
    { "content-type": "application/json" }, { "content-type": "multipart/form-data; boundary=x" },
    { "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded; charset=latin1" },
    { "content-length": "4097" }, { "content-length": "01" },
  ])("denies hostile preflight before permit %j", async headers => {
    const permit = vi.fn(allow); expect(await read(request(encoded, headers), permit)).toBeNull(); expect(permit).not.toHaveBeenCalled();
  });
  it("keeps JSON and native-form media policies separate", async () => {
    expect(await readProductClickRequest(request(), origin, "redeem", allow)).toBeNull();
    expect(await read(request(JSON.stringify(fields), { "content-type": "application/json" }))).toBeNull();
    expect(await readProductClickRequest(request(JSON.stringify(fields), { "content-type": "application/json" }), origin, "redeem", allow)).toEqual(fields);
  });
  it("counts encoded bytes, declared equality, invalid UTF-8 and overflow", async () => {
    expect(await read(request(encoded, { "content-length": String(encoded.length) }))).not.toBeNull();
    expect(await read(request(encoded, { "content-length": String(encoded.length-1) }))).toBeNull();
    expect(await read(request(new Uint8Array([255])))).toBeNull();
    const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(4097)); }, cancel });
    expect(await read(request(stream))).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each(["permit", "body"])("bounds hanging native %s", async kind => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn(); const permit = kind === "permit" ? () => new Promise<boolean>(() => {}) : allow;
      const result = read(request(kind === "body" ? new ReadableStream<Uint8Array>({ cancel }) : encoded), permit);
      await vi.advanceTimersByTimeAsync(5000); expect(await result).toBeNull();
      if (kind === "body") expect(cancel).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("denies failed permits and aborted requests without reading or retry", async () => {
    const permit = vi.fn(async () => { throw new Error("private"); });
    expect(await read(request(), permit)).toBeNull(); expect(permit).toHaveBeenCalledTimes(1);
    expect(await read(request(), async () => false)).toBeNull();
    const controller = new AbortController(); controller.abort(); const unused = vi.fn(allow);
    expect(await read(request(encoded, {}, { signal: controller.signal }), unused)).toBeNull(); expect(unused).not.toHaveBeenCalled();
  });
});
