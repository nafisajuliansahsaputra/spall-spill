import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createPublishedProductClickIntentCore, type ProductClickIntentRecord } from "./product-click-intent";
import { createProductClickIntentRpcAdapter } from "./product-click-intent-store";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const url = "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB";
const key = "b".repeat(64);
const record: ProductClickIntentRecord = {
  purpose: "published-product-click-v1",
  binding: { handle: "creator", spill_reference: 27, provider_key: "shopee",
    publication_token: "a".repeat(64), destination_hash: hash(url) },
  confirmation_hash: "c".repeat(64), issued_at: 100_000, expires_at: 220_000,
};
function fixture(response: unknown = { data: true, error: null }) {
  const rpc = vi.fn(async (): Promise<unknown> => response);
  const schema = vi.fn(() => ({ rpc }));
  const adapter = createProductClickIntentRpcAdapter({ schema } as unknown as Pick<SupabaseClient, "schema">);
  return { ...adapter, rpc, schema };
}
describe("staged private Product intent RPC adapter", () => {
  it("creates through the exact private RPC without exposing or mutating the input", async () => {
    const f = fixture(); const before = structuredClone(record);
    expect(await f.store.create(key, record)).toBe(true);
    expect(f.schema).toHaveBeenCalledExactlyOnceWith("api");
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("create_product_click_intent_server", {
      input_token_hash: key, input_record: record,
    });
    expect(record).toEqual(before);
  });
  it.each([false, null, undefined, "true", 1, {}, [true]])("rejects nonliteral create acknowledgment %j", async (data) => {
    const f = fixture({ data, error: null });
    expect(await f.store.create(key, record)).toBe(false); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["", "A".repeat(64), "b".repeat(63), "raw-token", null])("rejects invalid hash %j before RPC", async (bad) => {
    const f = fixture();
    expect(await f.store.create(bad as string, record)).toBe(false);
    expect(await f.store.consume(bad as string)).toBeNull(); expect(f.schema).not.toHaveBeenCalled();
  });
  it.each([
    null, { ...record, purpose: "other" }, { ...record, raw_token: "private" },
    { ...record, expires_at: 220_001 }, { ...record, issued_at: "100000" },
    { ...record, binding: { ...record.binding, handle: "CREATOR" } },
    { ...record, binding: { ...record.binding, destination_url: url } },
    { ...record, binding: { ...record.binding, publication_token: "bad" } },
  ])("rejects invalid create and consumed record %j", async (bad) => {
    const f = fixture({ data: bad, error: null });
    expect(await f.store.create(key, bad as ProductClickIntentRecord)).toBe(false);
    expect(f.schema).not.toHaveBeenCalled();
    expect(await f.store.consume(key)).toBeNull(); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("consumes one strict record via the exact standalone RPC", async () => {
    const f = fixture({ data: record, error: null });
    expect(await f.store.consume(key)).toEqual(record);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("consume_product_click_intent_server", { input_token_hash: key });
  });
  it.each([null, undefined, [], { data: record }])("maps absent/malformed consumption %j to null", async (data) => {
    expect(await fixture({ data, error: null }).store.consume(key)).toBeNull();
  });
  it.each([{}, { data: true }, { data: true, error: { message: "permission denied" } }, null])("denies failed/incomplete response %j without retry", async (response) => {
    const f = fixture(response);
    expect(await f.store.create(key, record)).toBe(false);
    expect(await f.store.consume(key)).toBeNull(); expect(await f.cleanup(10)).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(3);
  });
  it("denies thrown RPC errors without retry or fallback", async () => {
    const f = fixture(); f.rpc.mockRejectedValue(new Error("unavailable"));
    expect(await f.store.create(key, record)).toBe(false);
    expect(await f.store.consume(key)).toBeNull(); expect(await f.cleanup(10)).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(3);
  });
  it.each([1, 500])("performs one bounded cleanup at limit %i", async (limit) => {
    const f = fixture({ data: limit, error: null });
    expect(await f.cleanup(limit)).toBe(limit);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("cleanup_product_click_intents_server", { input_limit: limit });
  });
  it.each([0, -1, 501, 1.5, NaN, Infinity])("rejects invalid cleanup limit %j before RPC", async (limit) => {
    const f = fixture(); expect(await f.cleanup(limit)).toBeNull(); expect(f.schema).not.toHaveBeenCalled();
  });
  it.each([-1, 11, 1.5, "1", true, null, undefined])("rejects invalid cleanup result %j", async (data) => {
    expect(await fixture({ data, error: null }).cleanup(10)).toBeNull();
  });
  it("distinguishes successful zero cleanup from RPC failure", async () => {
    expect(await fixture({ data: 0, error: null }).cleanup(10)).toBe(0);
  });
  it("waits for consumption before resolution and never restores on fresh safety denial", async () => {
    const f = fixture(); const events: string[] = [];
    let complete!: (response: unknown) => void;
    f.rpc.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; events.push("consume-start"); }));
    const resolve = vi.fn(async () => { events.push("resolve"); return { status: "unavailable" }; });
    const core = createPublishedProductClickIntentCore({ store: f.store, resolve, now: () => 100_001 });
    const token = Buffer.alloc(32, 7).toString("base64url");
    const result = core.redeem(token, { handle: "creator", spill_reference: 27, provider_key: "shopee" });
    expect(events).toEqual(["consume-start"]); expect(resolve).not.toHaveBeenCalled();
    events.push("consume-response"); complete({ data: record, error: null });
    expect(await result).toBeNull(); expect(events).toEqual(["consume-start", "consume-response", "resolve"]);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("consume_product_click_intent_server", { input_token_hash: hash(token) });
  });
});
