import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerMediaBlockWorkingReader } from "./owner-media-block-working";
const id = "22600000-0000-4000-8000-000000000011";
const request = { block_id: id };
const asset = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const payload = { status: "success", current_handle: "media-owner", primary_use_case: "personal", collection_revision: 3,
  block: { block_id: id, kind: "media", is_visible: false, position: 4, payload_state: "present", media_working: { asset_key: asset, alt_text: "Private" }, asset_state: "registered" } };
function fixture() {
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    expect(String(input)).toBe("https://media-fixture.example.test/rest/v1/rpc/resolve_current_owner_media_block_working");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({ input_block_id: id });
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.signal).toBeDefined();
    return new Response(JSON.stringify(payload));
  });
  const client = createClient("https://media-fixture.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { reader: createOwnerMediaBlockWorkingReader(client), fetcher };
}
afterEach(() => vi.useRealTimers());
it("uses the actual pinned SDK fixed API, POST, selected ID and abort signal", async () => {
  const f = fixture();
  expect(await f.reader.read(request)).toEqual({ ...payload, block: { ...payload.block, issues: [] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["creator", "affiliate", "business", "personal", "other"])("reads hidden own Media without capability filtering for %s", async primary_use_case => {
  const f = fixture(); const data = { ...payload, primary_use_case }; f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["registered", "unavailable"])("retains raw private work for registry observation %s", async asset_state => {
  const f = fixture(); const data = { ...payload, block: { ...payload.block, asset_state } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
});
it.each([null, "", " ", "e\u0301🙂", "<script>literal()</script>", "🙂".repeat(2048), "Keep\t\r\n", "Keep\u007f"])(
  "preserves exact nullable/raw alt text and derives local diagnostics %#", async alt_text => {
    const f = fixture(); const data = { ...payload, block: { ...payload.block, media_working: { asset_key: asset, alt_text } } };
    f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
    const controls = alt_text !== null && /[\x01-\x1f\x7f]/.test(alt_text);
    expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block,
      issues: controls ? [{ field: "alt_text", code: "alt_text_control_character" }] : [] } });
  });
it("keeps missing payload distinct from present all-null content without a selected asset", async () => {
  const f = fixture(); const data = { ...payload, block: { ...payload.block, payload_state: "missing", media_working: null, asset_state: "not_selected" } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, block: { ...payload.block,
    media_working: { asset_key: null, alt_text: null }, asset_state: "not_selected" } })));
  expect(await f.reader.read(request)).toMatchObject({ block: { payload_state: "present",
    media_working: { asset_key: null, alt_text: null }, asset_state: "not_selected",
    issues: [{ field: "asset_key", code: "asset_required" }] } });
});
it.each([null, {}, id, [], { block_id: null }, { block_id: 1 }, { block_id: "../other" }, { block_id: id.toUpperCase().replace("226", "ABC") },
  ...["owner_id", "kind", "permission", "expected_revision", "client"].map(key => ({ ...request, [key]: "untrusted" })),
])("rejects malformed/extra selectors before I/O %#", async input => {
  const f = fixture(); expect(await f.reader.read(input)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
});
it.each([null, {}, { status: "unavailable" }, { ...payload, current_handle: "../owner" }, { ...payload, primary_use_case: "admin" },
  { ...payload, collection_revision: 0 }, { ...payload, collection_revision: 1.5 }, { ...payload, collection_revision: Number.MAX_SAFE_INTEGER + 1 },
  ...["owner_id", "published", "claims", "issues"].map(key => ({ ...payload, [key]: "private" })),
])("denies malformed/private response context without retained content %#", async data => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data))); expect(await f.reader.read(request)).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { block_id: "22600000-0000-4000-8000-000000000012" }, { kind: "generic_link" }, { is_visible: "true" }, { position: 0 }, { position: 2147483648 },
  { payload_state: "missing" }, { payload_state: "not_implemented", media_working: null }, { media_working: null },
  { asset_state: "unknown" }, { asset_state: "not_selected" },
  { media_working: { asset_key: null, alt_text: null } },
  { payload_state: "missing", media_working: null, asset_state: "registered" },
  ...[{}, { asset_key: asset }, { asset_key: 1, alt_text: null }, { asset_key: asset, alt_text: 1 },
    { asset_key: asset.toUpperCase(), alt_text: null }, { asset_key: "https://private.example/image", alt_text: null },
    { asset_key: asset, alt_text: "🙂".repeat(2049) }, { asset_key: asset, alt_text: String.fromCharCode(0) },
    ...["owner_id", "kind", "object_key", "url", "metadata", "issues", "safe", "published", "created_at"].map(key =>
      ({ asset_key: asset, alt_text: null, [key]: "untrusted" })),
  ].map(media_working => ({ media_working })),
  ...["owner_id", "issues", "safe", "published", "created_at"].map(key => ({ [key]: "private" })),
])("denies wrong selected block, payload pair or nested data %#", async fields => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, block: { ...payload.block, ...fields } })));
  expect(await f.reader.read(request)).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["permission", "network", "malformed-json"])("fails closed on %s without retry", async reason => {
  const f = fixture(); if (reason === "network") f.fetcher.mockRejectedValue(new Error("private fixture error"));
  else f.fetcher.mockResolvedValue(new Response(reason === "malformed-json" ? "not json" : '{"message":"private fixture error"}', { status: reason === "permission" ? 403 : 200 }));
  expect(await f.reader.read(request)).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("copies the selected ID before awaiting and does not cache", async () => {
  const f = fixture(); let finish!: (response: Response) => void;
  f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const input = { ...request }; const pending = f.reader.read(input); input.block_id = "22600000-0000-4000-8000-000000000012";
  await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(f.fetcher.mock.calls[0]![1]!.body))).toEqual({ input_block_id: id });
  finish(new Response(JSON.stringify(payload))); expect(await pending).toMatchObject({ block: { block_id: id } });
  expect(await f.reader.read(request)).toMatchObject({ block: { block_id: id } }); expect(f.fetcher).toHaveBeenCalledTimes(2);
});
it("rejects ignored late responses after abort without reviving private output", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (response: Response) => void;
  f.fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.reader.read(request); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toBeNull();
  expect(f.fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  finish(new Response(JSON.stringify(payload))); await vi.advanceTimersByTimeAsync(0); expect(await pending).toBeNull();
  expect(await f.reader.read(request)).toMatchObject({ block: { block_id: id } }); expect(f.fetcher).toHaveBeenCalledTimes(2);
});
