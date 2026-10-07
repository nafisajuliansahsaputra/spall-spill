import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createExactPublishedSpillResolver } from "./exact-published-spill";
import { publicSpillItemPayloadSchema } from "./spill-item-contract";

const product = {
  status: "success", current_handle: "renamed", display_name: "Published Owner", spill_reference: 27,
  title: "Published Product", primary_image_path: "/media/product/renamed/27",
  destinations: [{ provider_key: "shopee", available: false, destination_url: null }],
};
const resource = {
  status: "success", current_handle: "renamed", display_name: "Published Owner", spill_reference: 27,
  title: "Published Resource", resource_type: "portfolio", available: false, source_url: null,
};
const taggedProduct = { status: "success", item_type: "product", detail: product };
const taggedResource = { status: "success", item_type: "resource", detail: resource };
const unavailable = { status: "unavailable" };
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
function fixture(data: unknown = taggedProduct) {
  const fetcher = vi.fn<typeof fetch>(async () => response(data));
  const client = createClient("https://database.example.test", "test-only-placeholder", {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { fetcher, resolve: createExactPublishedSpillResolver(client) };
}
afterEach(() => vi.useRealTimers());

describe("private exact Published Item resolver with pinned SDK", () => {
  it.each(["27", "#27"])("normalizes %s and makes only one locator-only RPC", async reference => {
    vi.useFakeTimers();
    const f = fixture(); const input = Object.freeze({ handle: "Previous", reference });
    expect(await f.resolve(input)).toEqual(taggedProduct);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://database.example.test/rest/v1/rpc/resolve_public_spill_item");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ input_handle: "previous", input_spill_reference: 27 });
    expect(new Headers(init?.headers).get("Content-Profile")).toBe("api");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(input).toEqual({ handle: "Previous", reference });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([taggedProduct, taggedResource, unavailable])("retains exact valid result %j without fallback", async payload => {
    const f = fixture(payload);
    expect(await f.resolve({ handle: "previous", reference: "27" })).toEqual(payload);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves exact safe Resource attribution without issuing an action", async () => {
    const payload = { ...taggedResource, detail: { ...resource, available: true,
      source_url: "https://portfolio.example.test/works?creator=original&campaign=A%2FB" } };
    const f = fixture(payload);
    expect(await f.resolve({ handle: "previous", reference: "#27" })).toEqual(payload);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    null, "27", {}, { handle: "previous", reference: 27 }, { handle: "previous", reference: "027" },
    { handle: "../previous", reference: "27" }, { handle: "previous", reference: "name" },
    { handle: "previous", reference: "27", item_type: "product" },
    { handle: "previous", reference: "27", owner_id: "private" },
    { handle: "previous", reference: "27", source_url: "https://foreign.example.test/" },
  ])("rejects invalid/non-exact/private locator %j without RPC", async input => {
    const f = fixture(); expect(await f.resolve(input)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("denies thrown getters without RPC or partial authority", async () => {
    const f = fixture();
    expect(await f.resolve({ handle: "previous", get reference() { throw new Error("private reason"); } })).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    null, [], { status: "success" }, { ...taggedProduct, item_type: "resource" },
    { ...taggedResource, item_type: "product" }, { ...taggedProduct, item_type: "other" },
    { ...taggedProduct, owner_id: "private" }, { ...taggedProduct, detail: { ...product, publication_token: "private" } },
    { ...taggedResource, detail: { ...resource, source_url: "https://unsafe.example.test/" } },
    { ...unavailable, item_type: "product" }, { ...unavailable, reason: "hidden" },
    { ...taggedResource, detail: { ...resource, spill_reference: 28 } },
    { ...taggedProduct, detail: { ...product, spill_reference: 28, primary_image_path: "/media/product/renamed/28" } },
  ])("keeps malformed/private/cross-type/wrong-reference response %j operationally null", async payload => {
    const f = fixture(payload);
    expect(await f.resolve({ handle: "previous", reference: "27" })).toBeNull();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps RPC failure distinct from authoritative unavailable, without retry", async () => {
    const f = fixture(); f.fetcher.mockResolvedValue(new Response('{"message":"private database reason"}', { status: 503 }));
    expect(await f.resolve({ handle: "previous", reference: "27" })).toBeNull();
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps thrown transport and malformed JSON operationally null", async () => {
    const f = fixture(); f.fetcher.mockRejectedValueOnce(new Error("private transport reason"));
    expect(await f.resolve({ handle: "previous", reference: "27" })).toBeNull();
    f.fetcher.mockResolvedValueOnce(new Response("malformed-json"));
    expect(await f.resolve({ handle: "previous", reference: "27" })).toBeNull();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("aborts at five seconds and ignores a late result without further RPC", async () => {
    vi.useFakeTimers(); const f = fixture(); let finish!: (value: Response) => void;
    f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const result = f.resolve({ handle: "previous", reference: "27" });
    await vi.advanceTimersByTimeAsync(4999); expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(await result).toBeNull();
    expect(f.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    finish(response(taggedProduct)); await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps sibling reads independent when one deadline expires", async () => {
    vi.useFakeTimers(); const f = fixture(taggedResource);
    f.fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const first = f.resolve({ handle: "previous", reference: "27" });
    expect(await f.resolve({ handle: "previous", reference: "#27" })).toEqual(taggedResource);
    await vi.advanceTimersByTimeAsync(5000); expect(await first).toBeNull();
    expect(f.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(f.fetcher.mock.calls[1]![1]?.signal?.aborted).toBe(false);
    expect(f.fetcher).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
});

describe("strict public Item type wrapper", () => {
  it.each([taggedProduct, taggedResource, unavailable])("accepts only existing public detail shape %j", payload => {
    expect(publicSpillItemPayloadSchema.parse(payload)).toEqual(payload);
  });
  it.each([
    { ...taggedProduct, detail: resource }, { ...taggedResource, detail: product },
    { ...taggedResource, detail: { ...resource, revision: 1 } }, { ...unavailable, detail: resource },
  ])("rejects cross-type/private context %j", payload => {
    expect(publicSpillItemPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
