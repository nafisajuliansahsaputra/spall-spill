import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublishedResourceOpenIntentCore, type ResourceOpenIntentRecord } from "./resource-open-intent";
import { createResourceOpenIntentRpcAdapter } from "./resource-open-intent-store";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const url = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const key = "b".repeat(64);
const record: ResourceOpenIntentRecord = {
  purpose: "published-resource-open-v1",
  binding: { handle: "creator", spill_reference: 27,
    publication_token: "a".repeat(64), source_hash: hash(url) },
  recognition_hash: "c".repeat(64), issued_at: 100_000, expires_at: 220_000,
};
function fixture(response: unknown = { data: true, error: null }) {
  const responseRpc = vi.fn(async (): Promise<unknown> => response);
  const abortSignal = vi.fn((signal: AbortSignal) => { void signal; return responseRpc(); });
  const rpc = vi.fn((name: string, parameters: unknown) => { void name; void parameters; return { abortSignal }; });
  const schema = vi.fn(() => ({ rpc }));
  const adapter = createResourceOpenIntentRpcAdapter({ schema } as unknown as Pick<SupabaseClient, "schema">);
  return { ...adapter, rpc, schema, responseRpc, abortSignal };
}
afterEach(() => vi.useRealTimers());
describe("staged private Resource intent RPC adapter", () => {
  it("creates through the exact private RPC without exposing or mutating the input", async () => {
    const f = fixture(); const before = structuredClone(record);
    expect(await f.store.create(key, record)).toBe(true);
    expect(f.schema).toHaveBeenCalledExactlyOnceWith("api");
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("create_resource_open_intent_server", {
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
    { ...record, binding: { ...record.binding, source_url: url } },
    { ...record, binding: { ...record.binding, publication_token: "bad" } },
  ])("rejects invalid create and consumed record %j", async (bad) => {
    const f = fixture({ data: bad, error: null });
    expect(await f.store.create(key, bad as unknown as ResourceOpenIntentRecord)).toBe(false);
    expect(f.schema).not.toHaveBeenCalled();
    expect(await f.store.consume(key)).toBeNull(); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("consumes one strict record via the exact standalone RPC", async () => {
    const f = fixture({ data: record, error: null });
    expect(await f.store.consume(key)).toEqual(record);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("consume_resource_open_intent_server", { input_token_hash: key });
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
    const f = fixture(); f.responseRpc.mockRejectedValue(new Error("unavailable"));
    expect(await f.store.create(key, record)).toBe(false);
    expect(await f.store.consume(key)).toBeNull(); expect(await f.cleanup(10)).toBeNull();
    expect(f.rpc).toHaveBeenCalledTimes(3);
  });
  it.each([1, 500])("performs one bounded cleanup at limit %i", async (limit) => {
    const f = fixture({ data: limit, error: null });
    expect(await f.cleanup(limit)).toBe(limit);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("cleanup_resource_open_intents_server", { input_limit: limit });
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
  it("uses actual SDK POST/schema transport without retrying failed mutations", async () => {
    const calls: Array<{ url: string; options: RequestInit }> = [];
    let response: unknown = true;
    let fail = false;
    const fetch = vi.fn(async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), options: options ?? {} });
      if (fail) throw new Error("transient network");
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = createClient("https://adapter.example.test", "test-only-publishable-placeholder", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
    });
    const f = createResourceOpenIntentRpcAdapter(client);
    expect(await f.store.create(key, record)).toBe(true);
    response = record; expect(await f.store.consume(key)).toEqual(record);
    response = 0; expect(await f.cleanup(10)).toBe(0);
    const names = ["create_resource_open_intent_server", "consume_resource_open_intent_server", "cleanup_resource_open_intents_server"];
    const bodies = [{ input_token_hash: key, input_record: record }, { input_token_hash: key }, { input_limit: 10 }];
    for (const [index, call] of calls.entries()) {
      expect(call.url).toBe(`https://adapter.example.test/rest/v1/rpc/${names[index]}`);
      expect(call.options.method).toBe("POST");
      expect(new Headers(call.options.headers).get("content-profile")).toBe("api");
      expect(JSON.parse(call.options.body as string)).toEqual(bodies[index]);
    }
    expect(fetch).toHaveBeenCalledTimes(3); fail = true;
    expect(await f.store.create(key, record)).toBe(false); expect(fetch).toHaveBeenCalledTimes(4);
    expect(await f.store.consume(key)).toBeNull(); expect(fetch).toHaveBeenCalledTimes(5);
    expect(await f.cleanup(10)).toBeNull(); expect(fetch).toHaveBeenCalledTimes(6);
  });
  it("waits for consumption before resolution and never restores on fresh safety denial", async () => {
    const f = fixture(); const events: string[] = [];
    let complete!: (response: unknown) => void;
    f.responseRpc.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; events.push("consume-start"); }));
    const resolve = vi.fn(async () => { events.push("resolve"); return { status: "unavailable" }; });
    const core = createPublishedResourceOpenIntentCore({ store: f.store, resolve, now: () => 100_001 });
    const token = Buffer.alloc(32, 7).toString("base64url");
    const result = core.redeem(token, { handle: "creator", spill_reference: 27 });
    expect(events).toEqual(["consume-start"]); expect(resolve).not.toHaveBeenCalled();
    events.push("consume-response"); complete({ data: record, error: null });
    expect(await result).toBeNull(); expect(events).toEqual(["consume-start", "consume-response", "resolve"]);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("consume_resource_open_intent_server", { input_token_hash: hash(token) });
  });
});

describe("Resource intent finite transport deadlines", () => {
  it.each(["create", "consume", "cleanup"] as const)("denies late abort-ignoring SDK %s without retry", async operation => {
    vi.useFakeTimers();
    let finish!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve; }));
    const client = createClient("https://adapter.example.test", "test-only-placeholder", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher },
    });
    const adapter = createResourceOpenIntentRpcAdapter(client);
    const pending = operation === "create" ? adapter.store.create(key, record)
      : operation === "consume" ? adapter.store.consume(key) : adapter.cleanup(10);
    let settled = false; void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(4999); expect(settled).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const signal = fetcher.mock.calls[0]![1]!.signal!;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(operation === "create" ? false : null); expect(signal.aborted).toBe(true);
    finish(new Response(JSON.stringify(operation === "create" ? true : operation === "consume" ? record : 1), {
      headers: { "content-type": "application/json" },
    }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toBe(operation === "create" ? false : null); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("gives simultaneous requests separate deadlines and clears completed timers", async () => {
    vi.useFakeTimers(); const f = fixture();
    f.responseRpc.mockImplementationOnce(() => new Promise(() => {}));
    const first = f.store.consume(key); await vi.advanceTimersByTimeAsync(4000);
    expect(await f.cleanup(10)).toBeNull(); expect(vi.getTimerCount()).toBe(1);
    expect(f.abortSignal.mock.calls[0]![0]).not.toBe(f.abortSignal.mock.calls[1]![0]);
    await vi.advanceTimersByTimeAsync(1000); expect(await first).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
  it("never resolves a source after uncertain consumption completes late", async () => {
    vi.useFakeTimers(); const f = fixture(); let finish!: (value: unknown) => void;
    f.responseRpc.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const resolve = vi.fn(async () => ({ status: "success", source_url: url }));
    const core = createPublishedResourceOpenIntentCore({ store: f.store, resolve, now: () => 100_001 });
    const result = core.redeem(Buffer.alloc(32, 7).toString("base64url"), { handle: "creator", spill_reference: 27 });
    await vi.advanceTimersByTimeAsync(5000); expect(await result).toBeNull();
    finish({ data: record, error: null }); await vi.advanceTimersByTimeAsync(0);
    expect(resolve).not.toHaveBeenCalled(); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("contains hostile input and response getters", async () => {
    const bad = { get binding() { throw new Error("private reason"); } };
    const f = fixture({ data: bad, error: null });
    expect(await f.store.create(key, bad as unknown as ResourceOpenIntentRecord)).toBe(false);
    expect(f.rpc).not.toHaveBeenCalled(); expect(await f.store.consume(key)).toBeNull();
  });
});
