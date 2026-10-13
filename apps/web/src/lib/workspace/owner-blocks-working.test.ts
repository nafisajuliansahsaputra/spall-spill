import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerBlocksWorkingReader } from "./owner-blocks-working";
const payload = { status: "success", current_handle: "current-owner", primary_use_case: "business", collection: null };
const row = { block_id: "86000000-0000-4000-8000-000000000001", kind: "generic_link", is_visible: true,
  position: 1, payload_state: "present", link_working: { title: "Private label", social_platform: null, destination_url: "HTTPS://Example.test/Exact?q=%2f" } };

function fixture() {
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    expect(String(input)).toBe("https://home-fixture.example.test/rest/v1/rpc/resolve_current_owner_blocks_working");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({});
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://home-fixture.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { reader: createOwnerBlocksWorkingReader(client), fetcher };
}
afterEach(() => vi.useRealTimers());
it.each(["creator", "affiliate", "business", "personal", "other"])("reads %s personalization without treating it as capability", async primary_use_case => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, primary_use_case })));
  expect(await f.reader.read()).toEqual({ ...payload, primary_use_case }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("uses the pinned SDK with no caller target or metadata arguments", async () => {
  const f = fixture(); expect(await f.reader.read()).toEqual(payload); expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(Object.keys((await f.reader.read())!)).toEqual(["status", "current_handle", "primary_use_case", "collection"]);
});
it.each([null, {}, { status: "unavailable" }, { ...payload, current_handle: "OTHER-OWNER" },
  { ...payload, current_handle: "../owner" }, { ...payload, current_handle: "ab" },
  { ...payload, primary_use_case: "admin" }, { ...payload, primary_use_case: null },
  { ...payload, owner_id: "private" }, { ...payload, account_state: "active" },
  { ...payload, identity_published: true }, { ...payload, revision: 4 }])("rejects unavailable/malformed/private context %j", async data => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read()).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["permission", "network"])("does not retry or leak %s errors", async reason => {
  const f = fixture();
  if (reason === "network") f.fetcher.mockRejectedValue(new Error("private fixture failure"));
  else f.fetcher.mockResolvedValue(new Response('{"message":"private fixture failure"}', { status: 403 }));
  expect(await f.reader.read()).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("denies late response that ignores abort without caching or reviving authority", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (response: Response) => void;
  f.fetcher.mockImplementationOnce((_input, options) => {
    expect(options!.signal).toBeDefined(); return new Promise(resolve => { finish = resolve; });
  });
  const pending = f.reader.read(); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toBeNull();
  expect(f.fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  finish(new Response(JSON.stringify(payload))); await vi.advanceTimersByTimeAsync(0); expect(await pending).toBeNull();
  expect(await f.reader.read()).toEqual(payload); expect(f.fetcher).toHaveBeenCalledTimes(2);
});

it("distinguishes initialized empty collection from absent collection without defaults", async () => {
  const f = fixture(); const data = { ...payload, collection: { revision: 1, blocks: [] } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data))); expect(await f.reader.read()).toEqual(data);
});
it.each([row, { ...row, is_visible: false }, { ...row, kind: "social", link_working: { ...row.link_working, title: null, social_platform: "custom-platform" } }])("preserves exact known link Working and hidden state %j", async block => {
  const f = fixture(); const data = { ...payload, collection: { revision: 1, blocks: [block] } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read()).toEqual({ ...data, collection: { revision: 1, blocks: [{ ...block, issues: [] }] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["contact", "media", "text", "spill_cta"])("keeps %s explicitly not implemented without invented content/issues", async kind => {
  const f = fixture(); const block = { ...row, kind, payload_state: "not_implemented", link_working: null };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, collection: { revision: 1, blocks: [block] } })));
  expect(await f.reader.read()).toMatchObject({ collection: { blocks: [{ ...block, issues: [] }] } });
});
it("distinguishes missing payload from all-null present payload with derived local issues", async () => {
  const f = fixture(); const blocks = [{ ...row, payload_state: "missing", link_working: null },
    { ...row, block_id: "86000000-0000-4000-8000-000000000002", position: 2, link_working: { title: null, social_platform: null, destination_url: null } }];
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, collection: { revision: 2, blocks } })));
  expect(await f.reader.read()).toMatchObject({ collection: { blocks: [
    { ...blocks[0], issues: [] }, { ...blocks[1], issues: [{ field: "title", code: "title_required" }, { field: "destination_url", code: "destination_required" }] },
  ] } });
});
it("preserves invalid raw Working and derives fixed issues without opening destination", async () => {
  const f = fixture(); const block = { ...row, link_working: { title: "", social_platform: "NotNormalized", destination_url: "javascript:private" } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, collection: { revision: 1, blocks: [block] } })));
  expect(await f.reader.read()).toMatchObject({ collection: { blocks: [{ ...block, issues: [
    { field: "title", code: "title_required" }, { field: "social_platform", code: "platform_not_applicable" }, { field: "destination_url", code: "destination_invalid" },
  ] }] } }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { block_id: "forged" }, { kind: "product" }, { position: 0 }, { position: 1.5 }, { position: 2147483648 },
  { is_visible: "true" }, { owner_id: "private" }, { issues: [] }, { public_url: "private" },
  { payload_state: "missing" }, { payload_state: "not_implemented" }, { link_working: null },
  { kind: "text" }, { link_working: { ...row.link_working, title: "🙂".repeat(513) } },
  { link_working: { ...row.link_working, destination_url: "x".repeat(2049) } },
  { link_working: { ...row.link_working, title: String.fromCharCode(0) } },
  { link_working: { ...row.link_working, safe: true } }, { link_working: { title: "Label" } },
])("denies malformed/private/inconsistent block %j", async fields => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, collection: { revision: 1, blocks: [{ ...row, ...fields }] } })));
  expect(await f.reader.read()).toBeNull();
});
it.each([
  { revision: 0, blocks: [] }, { revision: Number.MAX_SAFE_INTEGER + 1, blocks: [] }, { revision: 1 },
  { revision: 1, blocks: [], published: true }, { revision: 1, blocks: [row, { ...row, position: 2 }] },
  { revision: 1, blocks: [{ ...row, position: 2 }, { ...row, block_id: "86000000-0000-4000-8000-000000000002", position: 1 }] },
])("denies unsafe/duplicate/out-of-order/incomplete collection %j", async collection => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, collection })));
  expect(await f.reader.read()).toBeNull();
});
it.each([500, 501])("requires complete bounded response with %s rows", async count => {
  const f = fixture(); const blocks = Array.from({ length: count }, (_, i) => ({ ...row, block_id: `86000000-0000-4000-8000-${String(i).padStart(12, "0")}`, position: i + 1 }));
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, collection: { revision: 1, blocks } })));
  const result = await f.reader.read(); if (count === 500) expect(result?.collection?.blocks).toHaveLength(500); else expect(result).toBeNull();
});
