import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerBlocksWorkingPageReader } from "./owner-blocks-working-page";
const start = { expected_collection_revision: null, after_position: null };
const next = { expected_collection_revision: 7, after_position: 10 };
const row = { block_id: "b8000000-0000-4000-8000-000000000001", kind: "generic_link", position: 11,
  is_visible: false, payload_state: "present", link_working: { title: "Raw", social_platform: null, destination_url: "HTTPS://Example.test/Exact?q=%2f" } };
const payload = { status: "success", current_handle: "page-owner", primary_use_case: "personal",
  collection: { revision: 7, blocks: [row], has_more: false, next_after_position: null } };
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ ...row, position: i + 11,
  block_id: `b8000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
function fixture(...values: [request?: unknown]) {
  const request = values.length ? values[0] : start;
  let data: unknown = payload;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    expect(String(input)).toBe("https://page.example.test/rest/v1/rpc/resolve_current_owner_blocks_working_page");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(JSON.parse(String(options!.body))).toEqual({ input_request: request }); expect(options!.signal).toBeDefined();
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://page.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { read: () => createOwnerBlocksWorkingPageReader(client).read(request), fetcher, set: (value: unknown) => { data = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it.each([start, next])("sends exact page request once and retains raw hidden payload with local issues", async request => {
  const f = fixture(request); expect(await f.read()).toEqual({ ...payload, collection: { ...payload.collection, blocks: [{ ...row, issues: [] }] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([null, undefined, {}, [], "start", { after_position: null }, { ...next, after_position: null },
  { ...start, after_position: 0 }, { ...next, expected_collection_revision: "7" }, { ...next, after_position: 2147483648 },
  ...["owner_id", "block_id", "limit", "offset", "kind", "is_visible"].map(key => ({ ...next, [key]: "forged" })),
])("rejects malformed request %j without any request", async request => {
  const f = fixture(request); expect(await f.read()).toEqual({ status: "invalid_page_request" }); expect(f.fetcher).not.toHaveBeenCalled();
});
it("preserves missing collection versus initialized empty terminal", async () => {
  for (const collection of [null, { ...payload.collection, blocks: [] }]) {
    const f = fixture(); f.set({ ...payload, collection }); expect(await f.read()).toEqual({ ...payload, collection });
  }
});
it.each(["social", "generic_link"])("preserves raw invalid %s and derives local issues", async kind => {
  const block = { ...row, kind, link_working: { title: "", social_platform: "NotNormalized", destination_url: "javascript:raw" } };
  const f = fixture(); f.set({ ...payload, collection: { ...payload.collection, blocks: [block] } });
  expect(await f.read()).toMatchObject({ collection: { blocks: [{ ...block, issues: expect.arrayContaining([kind === "social" ? { field: "social_platform", code: "platform_invalid" } : { field: "title", code: "title_required" }, { field: "destination_url", code: "destination_invalid" }]) }] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["contact", "media", "text", "spill_cta"])("retains %s not_implemented without invented payload", async kind => {
  const block = { ...row, kind, payload_state: "not_implemented", link_working: null };
  const f = fixture(); f.set({ ...payload, collection: { ...payload.collection, blocks: [block] } });
  expect(await f.read()).toMatchObject({ collection: { blocks: [{ ...block, issues: [] }] } });
});
it.each(["missing", "present"])("distinguishes %s link payload", async payload_state => {
  const block = { ...row, payload_state, link_working: payload_state === "missing" ? null : { title: null, social_platform: null, destination_url: null } };
  const f = fixture(); f.set({ ...payload, collection: { ...payload.collection, blocks: [block] } });
  expect(await f.read()).toMatchObject({ collection: { blocks: [{ ...block, issues: payload_state === "missing" ? [] : expect.arrayContaining([{ field: "title", code: "title_required" }]) }] } });
});
it.each([false, true])("accepts exact100 boundary with has_more %s", async has_more => {
  const f = fixture(next); f.set({ ...payload, collection: { ...payload.collection, blocks: rows(100), has_more, next_after_position: has_more ? 110 : null } });
  expect(await f.read()).toMatchObject({ collection: { has_more, blocks: expect.any(Array) } }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("accepts explicit terminal continuation", async () => {
  const f = fixture(next); f.set({ ...payload, collection: { ...payload.collection, blocks: [] } });
  expect(await f.read()).toEqual({ ...payload, collection: { ...payload.collection, blocks: [] } });
});
it.each(["unavailable", "invalid_page_request", "stale_read"])("returns only strict %s without restart", async status => {
  const f = fixture(next); f.set({ status }); expect(await f.read()).toEqual({ status }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([null, {}, [], { ...payload, owner_id: "forged" }, { ...payload, current_handle: "INVALID" }, { ...payload, primary_use_case: "admin" },
  { status: "stale_read", collection: payload.collection }, { status: "already_initialized" },
  ...[0, 1.5, Number.MAX_SAFE_INTEGER + 1, "7"].map(revision => ({ ...payload, collection: { ...payload.collection, revision } })),
  ...[{ has_more: true }, { has_more: "false" }, { next_after_position: 11 }, { next_after_position: undefined }, { blocks: rows(101) },
    { blocks: [row, row] }, { blocks: [row, { ...row, block_id: rows(2)[1]!.block_id }] },
    { blocks: [{ ...row, issues: [] }] }, { blocks: [{ ...row, block_id: "forged" }] },
    { blocks: [{ ...row, payload_state: "missing" }] }, { blocks: [{ ...row, kind: "media" }] },
    { blocks: [{ ...row, is_visible: "false" }] }, { blocks: [{ ...row, position: 0 }] },
    { blocks: [{ ...row, link_working: { ...row.link_working, title: "\0" } }] },
    ...[["title", 513], ["social_platform", 41], ["destination_url", 2049]].map(([key, n]) => ({ blocks: [{ ...row, link_working: { ...row.link_working, [key as string]: "🙂".repeat(n as number) } }] })),
    { blocks: rows(100), has_more: true, next_after_position: 109 },
  ].map(extra => ({ ...payload, collection: { ...payload.collection, ...extra } })),
])("drops malformed/forged page %j without partial data", async value => {
  const f = fixture(); f.set(value); expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([null, { ...payload.collection, revision: 8 }, { ...payload.collection, blocks: [{ ...row, position: 10 }] },
  { ...payload.collection, blocks: [{ ...row, position: 1 }] },
])("rejects continuation snapshot/cursor contradiction %j", async collection => {
  const f = fixture(next); f.set({ ...payload, collection }); expect(await f.read()).toEqual({ status: "unavailable" });
});
it.each(["network", "permission"])("fails %s without retry or private error", async reason => {
  const f = fixture(); if (reason === "network") f.fetcher.mockRejectedValue(new Error("private"));
  else f.fetcher.mockResolvedValue(new Response('{"message":"private"}', { status: 403 }));
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("deadline cannot revive ignored late reply or cache data", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (reply: Response) => void;
  f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.read(); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  expect(f.fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  finish(new Response(JSON.stringify(payload))); await vi.advanceTimersByTimeAsync(0); expect(await pending).toEqual({ status: "unavailable" });
  expect(f.fetcher).toHaveBeenCalledTimes(1); expect(await f.read()).toMatchObject({ status: "success" }); expect(f.fetcher).toHaveBeenCalledTimes(2);
});
