import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerTextBlockWorkingReader } from "./owner-text-block-working";
const id = "14000000-0000-4000-8000-000000000011";
const request = { block_id: id };
const payload = { status: "success", current_handle: "text-owner", primary_use_case: "personal", collection_revision: 3,
  block: { block_id: id, kind: "text", is_visible: false, position: 4, payload_state: "present", text_working: { text: "Private" } } };
function fixture() {
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    expect(String(input)).toBe("https://text-fixture.example.test/rest/v1/rpc/resolve_current_owner_text_block_working");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({ input_block_id: id });
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.signal).toBeDefined();
    return new Response(JSON.stringify(payload));
  });
  const client = createClient("https://text-fixture.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { reader: createOwnerTextBlockWorkingReader(client), fetcher };
}
afterEach(() => vi.useRealTimers());
it("uses the actual pinned SDK fixed API, POST, selected ID and abort signal", async () => {
  const f = fixture();
  expect(await f.reader.read(request)).toEqual({ ...payload, block: { ...payload.block, issues: [] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["creator", "affiliate", "business", "personal", "other"])("reads hidden own Text without capability filtering for %s", async primary_use_case => {
  const f = fixture(); const data = { ...payload, primary_use_case }; f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([null, "", " \t\r\n", "e\u0301\r\n🙂", '<script>literal()</script> https://127.0.0.1/private', "🙂".repeat(16384), "A" + String.fromCharCode(1)])("retains exact raw Text with local diagnostics %#", async text => {
  const f = fixture(); const data = { ...payload, block: { ...payload.block, text_working: { text } } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  const issues = !text?.trim() ? [{ field: "text", code: "text_required" }]
    : text.includes(String.fromCharCode(1)) ? [{ field: "text", code: "text_control_character" }] : [];
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("keeps missing payload distinct from present all-null content", async () => {
  const f = fixture(); const data = { ...payload, block: { ...payload.block, payload_state: "missing", text_working: null } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, block: { ...payload.block, text_working: { text: null } } })));
  expect(await f.reader.read(request)).toMatchObject({ block: { payload_state: "present", text_working: { text: null }, issues: [{ field: "text", code: "text_required" }] } });
});
it.each([null, {}, id, [], { block_id: null }, { block_id: 1 }, { block_id: "../other" }, { block_id: id.toUpperCase().replace("140", "ABC") },
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
  { block_id: "14000000-0000-4000-8000-000000000012" }, { kind: "generic_link" }, { is_visible: "true" }, { position: 0 }, { position: 2147483648 },
  { payload_state: "missing" }, { payload_state: "not_implemented", text_working: null }, { text_working: null },
  { text_working: {} }, { text_working: { text: 1 } }, { text_working: { text: "🙂".repeat(16385) } },
  { text_working: { text: String.fromCharCode(0) } }, { text_working: { text: "Private", html: true } },
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
  const input = { ...request }; const pending = f.reader.read(input); input.block_id = "14000000-0000-4000-8000-000000000012";
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
