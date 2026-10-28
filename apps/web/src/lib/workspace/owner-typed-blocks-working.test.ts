import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerTypedBlocksWorkingPageReader } from "./owner-typed-blocks-working-page";
import { createOwnerTypedBlocksWorkingAssembly } from "./owner-typed-blocks-working-assembly";

const subject = "24400000-0000-4000-8000-000000000001";
const owner = "24400000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "typed-owner", primary_use_case: "personal" };
const start = { expected_collection_revision: null, after_position: null };
const values = [
  { kind: "social", title: null, social_platform: "raw", destination_url: "javascript:raw()" },
  { kind: "generic_link", title: " <Raw> ", social_platform: null, destination_url: null },
  { kind: "contact", contact_type: null, label: "Raw\n", value: null },
  { kind: "text", text: " <Text>\n " },
  { kind: "media", asset_key: null, alt_text: " <Alt> " },
  { kind: "spill_cta", target: "owner_spill" },
];
const row = (i: number, value: object = values[i % 6]!) => ({
  block_id: `24400000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`, kind: (value as { kind: string }).kind,
  position: i + 1, is_visible: false, payload_state: "present", working: value,
  media_asset_state: (value as { kind: string }).kind === "media" ? "not_selected" : null,
});
const rows = values.map((value, i) => row(i, value));
const page = (blocks: object[] = rows) => ({ ...context, collection: { revision: 3, blocks, has_more: false, next_after_position: null } });
function fixture() {
  let payload: unknown = page(); const calls: string[] = []; const requests: unknown[] = [];
  const states: unknown[] = [active, active, active];
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(new URL(String(url)).origin).toBe("https://typed.example.test");
    expect(options!.method).toBe("POST"); expect(options!.signal).toBeDefined();
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    const rpc = String(url).split("/").at(-1)!; calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === "resolve_current_owner_typed_blocks_working_page") {
      expect(Object.keys(body)).toEqual(["input_request"]); requests.push(body.input_request);
    } else expect(body).toEqual({});
    return Response.json(rpc === "resolve_current_owner_state" ? states.shift()
      : rpc === "resolve_current_owner_home_context" ? context : payload);
  });
  const client = createClient("https://typed.example.test", "test-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  return { read: createOwnerTypedBlocksWorkingPageReader(client).read, assemble: createOwnerTypedBlocksWorkingAssembly(client).read,
    fetcher, claims, calls, requests, states, setPayload: (value: unknown) => { payload = value; } };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("loads all six raw types with shared local diagnostics and no normalization", async () => {
  const f = fixture(); const result = await f.read(start);
  expect(result.status).toBe("success"); if (result.status !== "success" || !result.collection) throw new Error("fixture failed");
  expect(result.collection.blocks.map(x => x.working)).toEqual(values);
  expect(result.collection.blocks[0]!.issues).toContainEqual({ field: "destination_url", code: "destination_invalid" });
  expect(result.collection.blocks[4]!.issues).toContainEqual({ field: "asset_key", code: "asset_required" });
  expect(result.collection.blocks[5]!.issues).toEqual([]);
  expect(f.requests).toEqual([start]); expect(f.claims).not.toHaveBeenCalled();
});
it.each(rows)("preserves missing typed payload for $kind without a fabricated default", async source => {
  const f = fixture(); f.setPayload(page([{ ...source, payload_state: "missing", working: null }]));
  const result = await f.read(start); expect(result.status).toBe("success");
  if (result.status === "success") expect(result.collection!.blocks[0]).toEqual({ ...source, payload_state: "missing", working: null, issues: [] });
});
it.each([null, {}, { ...start, owner_id: owner }, { expected_collection_revision: 3, after_position: null },
  { expected_collection_revision: 0, after_position: 1 }])("rejects invalid selectors before I/O %#", async request => {
  const f = fixture(); expect(await f.read(request)).toEqual({ status: "invalid_page_request" }); expect(f.calls).toEqual([]);
});
it.each(rows)("rejects cross-kind and private authority attached to $kind", async source => {
  const f = fixture(); f.setPayload(page([{ ...source, kind: source.kind === "text" ? "contact" : "text" }]));
  expect(await f.read(start)).toEqual({ status: "unavailable" });
  f.setPayload(page([{ ...source, owner_id: owner }])); expect(await f.read(start)).toEqual({ status: "unavailable" });
  f.setPayload(page([{ ...source, working: { ...source.working, published: true } }])); expect(await f.read(start)).toEqual({ status: "unavailable" });
});
it.each([
  { ...rows[0], working: null }, { ...rows[0], payload_state: "missing" }, { ...rows[0], media_asset_state: "registered" },
  { ...rows[4], media_asset_state: "registered" }, { ...rows[4], media_asset_state: null },
  { ...rows[5], working: { kind: "spill_cta", target: "https://evil.test" } },
  { ...rows[3], working: { kind: "text", text: "x".repeat(16385) } },
])("rejects contradictory or over-envelope payload %#", async value => {
  const f = fixture(); f.setPayload(page([value])); expect(await f.read(start)).toEqual({ status: "unavailable" });
});
it.each(["registered", "unavailable"])("retains canonical Media key with %s observation without adding authority", async media_asset_state => {
  const f = fixture(); const source = { ...rows[4], working: { ...values[4], asset_key: subject }, media_asset_state };
  f.setPayload(page([source])); const result = await f.read(start);
  expect(result.status).toBe("success"); if (result.status === "success") expect(result.collection!.blocks[0]!.working).toEqual(source.working);
});
it("denies stale/duplicate/order/cursor/overflow pages instead of partial results", async () => {
  const f = fixture();
  for (const collection of [
    { ...page().collection, blocks: [rows[0], rows[0]] },
    { ...page().collection, blocks: [...rows].reverse() },
    { ...page().collection, has_more: true, next_after_position: 6 },
    { ...page().collection, next_after_position: 6 },
    { ...page().collection, blocks: Array.from({ length: 101 }, (_, i) => row(i)) },
  ]) { f.setPayload({ ...context, collection }); expect(await f.read(start)).toEqual({ status: "unavailable" }); }
  f.setPayload(page()); expect(await f.read({ expected_collection_revision: 2, after_position: 1 })).toEqual({ status: "unavailable" });
  expect(await f.read({ expected_collection_revision: 3, after_position: 1 })).toEqual({ status: "unavailable" });
});
it("guarded typed reconstruction uses two complete observations and three unchanged proofs", async () => {
  const f = fixture(); const result = await f.assemble(); expect(result.status).toBe("success");
  expect(f.claims).toHaveBeenCalledTimes(3); expect(f.requests).toEqual([start, start]); expect(f.calls).toHaveLength(7);
});
it.each([0, 1, 2])("subject/Owner loss at proof %s retains no typed data", async phase => {
  const f = fixture(); f.states[phase] = { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.assemble()).toEqual({ status: "restricted" }); expect(f.requests.length).toBe(phase * 1);
});
it("same revision with changed typed content fails the complete observation comparison", async () => {
  const f = fixture(); const original = f.fetcher.getMockImplementation()!; let pages = 0;
  f.fetcher.mockImplementation(async (url, options) => {
    if (String(url).endsWith("resolve_current_owner_typed_blocks_working_page") && ++pages === 2)
      f.setPayload(page([{ ...rows[3], working: { kind: "text", text: "changed privately" } }]));
    return original(url, options);
  });
  expect(await f.assemble()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(2);
});
it("ignored page transport deadline aborts and never revives a result", async () => {
  vi.useFakeTimers(); const f = fixture(); let signal: AbortSignal | null | undefined;
  f.fetcher.mockImplementation((_url, options) => new Promise(() => { signal = options?.signal; }));
  const pending = f.read(start); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: "unavailable" }); expect(signal?.aborted).toBe(true); expect(f.calls).toEqual([]);
});
it("8MiB page bound rejects a well-shaped escaped Text page", async () => {
  const f = fixture(); f.setPayload(page(Array.from({ length: 100 }, (_, i) => row(i, { kind: "text", text: "\u0001".repeat(16384) }))));
  expect(await f.read(start)).toEqual({ status: "unavailable" });
});
function paginated(f: ReturnType<typeof fixture>, total: number, text: string) {
  const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (url, options) => {
    if (String(url).endsWith("resolve_current_owner_typed_blocks_working_page")) {
      const request = JSON.parse(String(options!.body)).input_request;
      const offset = request.after_position ?? 0;
      const blocks = Array.from({ length: Math.min(100, total - offset) }, (_, i) => row(offset + i, { kind: "text", text }));
      const has_more = offset + blocks.length < total;
      f.setPayload({ ...context, collection: { revision: 3, blocks, has_more,
        next_after_position: has_more ? blocks.at(-1)!.position : null } });
    }
    return original(url, options);
  });
}
it("full typed 1000-row reconstruction retains exact25-RPC and3-proof envelope", async () => {
  const f = fixture(); paginated(f, 1000, "Raw Text");
  const result = await f.assemble(); expect(result.status).toBe("success");
  if (result.status === "success") expect(result.collection!.blocks).toHaveLength(1000);
  expect(f.calls).toHaveLength(25); expect(f.requests).toHaveLength(20); expect(f.claims).toHaveBeenCalledTimes(3);
});
it("1001 rows never yield a truncated successful collection or a restart", async () => {
  const f = fixture(); paginated(f, 1001, "Raw Text");
  expect(await f.assemble()).toEqual({ status: "unavailable" }); expect(f.requests).toHaveLength(10);
  expect(f.claims).toHaveBeenCalledTimes(1);
});
it("64MiB aggregate rejects individually admissible Text pages before retaining a complete collection", async () => {
  // Freeze only timers to isolate the resource gate; deadline denial has separate tests.
  vi.useFakeTimers(); const f = fixture(); paginated(f, 1000, "\u0001".repeat(12800));
  expect(await f.assemble()).toEqual({ status: "unavailable" });
  expect(f.requests).toHaveLength(9); expect(f.claims).toHaveBeenCalledTimes(1);
}, 20000);
