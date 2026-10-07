import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublishedResourceRpcAdapter } from "./resource-rpc";

const url = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const binding = { handle: "renamed", spill_reference: 27, publication_token: "a".repeat(64),
  source_hash: createHash("sha256").update(url).digest("hex") };
const recognition = { status: "success", current_handle: "renamed", display_name: "Published Owner",
  spill_reference: 27, title: "Published Resource", resource_type: "portfolio", available: true, source_url: url };
const context = { status: "success", recognition, binding };
const unavailable = { status: "unavailable" };
const source = { status: "success", source_url: url };
const response = (data: unknown) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
function fixture(data: unknown = context) {
  const fetcher = vi.fn<typeof fetch>(async () => response(data));
  const client = createClient("https://database.example.test", "test-only-placeholder", {
    global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { fetcher, adapter: createPublishedResourceRpcAdapter(client) };
}
afterEach(() => vi.useRealTimers());

describe("private Resource RPC adapter with pinned SDK", () => {
  it.each(["27", "#27"])("reads normalized locator %s once, retaining canonical alias context", async reference => {
    vi.useFakeTimers(); const f = fixture();
    const input = Object.freeze({ handle: "Previous", reference });
    expect(await f.adapter.readContext(input)).toEqual(context);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const [endpoint, init] = f.fetcher.mock.calls[0]!;
    expect(String(endpoint)).toBe("https://database.example.test/rest/v1/rpc/resolve_published_resource_context_server");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ input_handle: "previous", input_spill_reference: 27 });
    expect(new Headers(init?.headers).get("Content-Profile")).toBe("api");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("resolves only private selected binding and preserves exact original attribution", async () => {
    const f = fixture(source);
    expect(await f.adapter.resolveSource(Object.freeze(binding))).toBe(url);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    const [endpoint, init] = f.fetcher.mock.calls[0]!;
    expect(String(endpoint)).toBe("https://database.example.test/rest/v1/rpc/resolve_published_resource_source_server");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ input_handle: "renamed", input_spill_reference: 27,
      input_publication_token: binding.publication_token, input_source_hash: binding.source_hash });
    expect(new Headers(init?.headers).get("Content-Profile")).toBe("api");
  });
  it.each([unavailable, { ...context, recognition: { ...recognition, available: false, source_url: null }, binding: null }])(
    "preserves authoritative unavailable/degraded context without source RPC", async payload => {
      const f = fixture(payload);
      expect(await f.adapter.readContext({ handle: "previous", reference: "27" })).toEqual(payload);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    });
  it.each([null, {}, { handle: "previous", reference: 27 }, { handle: "previous", reference: "027" },
    { handle: "previous", reference: "27", binding }, { handle: "previous", reference: "27", owner_id: "private" }])(
    "denies invalid/browser authority locator without RPC", async input => {
      const f = fixture(); expect(await f.adapter.readContext(input)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each([null, {}, recognition, { ...binding, source_url: url }, { ...binding, publication_token: "guessed" },
    { ...binding, spill_reference: 0 }, { ...binding, owner_id: "private" }])("denies malformed source binding without RPC", async input => {
    const f = fixture(); expect(await f.adapter.resolveSource(input)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("catches hostile getters at both ingress boundaries", async () => {
    const f = fixture(); const hostile = { get handle() { throw new Error("private reason"); } };
    expect(await f.adapter.readContext(hostile)).toBeNull(); expect(await f.adapter.resolveSource(hostile)).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([null, { ...unavailable, reason: "hidden" }, { ...context, owner_id: "private" },
    { ...context, recognition: { ...recognition, spill_reference: 28 } },
    { ...context, binding: { ...binding, handle: "foreign" } },
    { ...context, binding: { ...binding, source_hash: "b".repeat(64) } },
    { ...context, recognition: { ...recognition, available: false, source_url: null } }])(
    "denies malformed/private/cross-context response", async payload => {
      const f = fixture(payload); expect(await f.adapter.readContext({ handle: "previous", reference: "27" })).toBeNull();
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    });
  it.each([unavailable, { ...source, reason: "private" }, { ...source, source_url: "https://foreign.example.test/" },
    { ...source, source_url: "javascript:alert(1)" }, { ...source, source_url: url + "&changed=1" }])(
    "denies unavailable/malformed/unsafe/hash-changed source without fallback", async payload => {
      const f = fixture(payload); expect(await f.adapter.resolveSource(binding)).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
    });
  it.each(["context", "source"] as const)("keeps %s transport failures operationally null without retry", async operation => {
    const f = fixture(); const read = () => operation === "context"
      ? f.adapter.readContext({ handle: "previous", reference: "27" }) : f.adapter.resolveSource(binding);
    f.fetcher.mockResolvedValueOnce(new Response('{"message":"private reason"}', { status: 503 }));
    expect(await read()).toBeNull();
    f.fetcher.mockRejectedValueOnce(new Error("private transport")); expect(await read()).toBeNull();
    f.fetcher.mockResolvedValueOnce(new Response("malformed-json")); expect(await read()).toBeNull();
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(["context", "source"] as const)("aborts %s at five seconds and ignores late success", async operation => {
    vi.useFakeTimers(); const f = fixture(); let finish!: (value: Response) => void;
    f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const result = operation === "context" ? f.adapter.readContext({ handle: "previous", reference: "27" }) : f.adapter.resolveSource(binding);
    await vi.advanceTimersByTimeAsync(4999); expect(f.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(await result).toBeNull();
    expect(f.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    finish(response(operation === "context" ? context : source)); await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps context/source operations independent across a deadline", async () => {
    vi.useFakeTimers(); const f = fixture(source);
    f.fetcher.mockImplementationOnce(() => new Promise(() => {}));
    const first = f.adapter.readContext({ handle: "previous", reference: "27" });
    expect(await f.adapter.resolveSource(binding)).toBe(url);
    await vi.advanceTimersByTimeAsync(5000); expect(await first).toBeNull();
    expect(f.fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true);
    expect(f.fetcher.mock.calls[1]![1]?.signal?.aborted).toBe(false);
    expect(f.fetcher).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
});
