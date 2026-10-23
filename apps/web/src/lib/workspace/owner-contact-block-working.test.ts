import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerContactBlockWorkingReader } from "./owner-contact-block-working";
const id = "18400000-0000-4000-8000-000000000011";
const request = { block_id: id };
const payload = { status: "success", current_handle: "contact-owner", primary_use_case: "personal", collection_revision: 3,
  block: { block_id: id, kind: "contact", is_visible: false, position: 4, payload_state: "present", contact_working: { contact_type: "email", label: null, value: "Private" } } };
function fixture() {
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    expect(String(input)).toBe("https://contact-fixture.example.test/rest/v1/rpc/resolve_current_owner_contact_block_working");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({ input_block_id: id });
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.signal).toBeDefined();
    return new Response(JSON.stringify(payload));
  });
  const client = createClient("https://contact-fixture.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { reader: createOwnerContactBlockWorkingReader(client), fetcher };
}
afterEach(() => vi.useRealTimers());
it("uses the actual pinned SDK fixed API, POST, selected ID and abort signal", async () => {
  const f = fixture();
  expect(await f.reader.read(request)).toEqual({ ...payload, block: { ...payload.block, issues: [] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["creator", "affiliate", "business", "personal", "other"])("reads hidden own Contact without capability filtering for %s", async primary_use_case => {
  const f = fixture(); const data = { ...payload, primary_use_case }; f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each(["email", "whatsapp", "phone", null])("keeps structured subtype and exact invalid target for %s", async contact_type => {
  const f = fixture(); const data = { ...payload, block: { ...payload.block,
    contact_working: { contact_type, label: "  LABEL  ", value: " Invalid Contact@ +62 " } } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block,
    issues: contact_type === null ? [{ field: "contact_type", code: "contact_type_required" }] : [] } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  [null, null, [{ field: "value", code: "value_required" }]],
  ["", "", [{ field: "value", code: "value_required" }]],
  [" ", " ", [{ field: "value", code: "value_required" }]],
  ["A\t", " \r\n", [{ field: "value", code: "value_required" }, { field: "label", code: "label_control_character" }, { field: "value", code: "value_control_character" }]],
  ["e\u0301🙂", "<script>literal()</script> https://127.0.0.1/private", []],
  ["🙂".repeat(512), "🙂".repeat(2048), []],
  ["A" + String.fromCharCode(127), "B" + String.fromCharCode(1), [{ field: "label", code: "label_control_character" }, { field: "value", code: "value_control_character" }]],
])("preserves exact raw label/value and local basic diagnostics %#", async (label, value, issues) => {
  const f = fixture(); const data = { ...payload, block: { ...payload.block, contact_working: { contact_type: "phone", label, value } } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues } });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("keeps missing payload distinct from present all-null content", async () => {
  const f = fixture(); const data = { ...payload, block: { ...payload.block, payload_state: "missing", contact_working: null } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
  expect(await f.reader.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, block: { ...payload.block,
    contact_working: { contact_type: null, label: null, value: null } } })));
  expect(await f.reader.read(request)).toMatchObject({ block: { payload_state: "present",
    contact_working: { contact_type: null, label: null, value: null }, issues: [
      { field: "contact_type", code: "contact_type_required" }, { field: "value", code: "value_required" }] } });
});
it.each([null, {}, id, [], { block_id: null }, { block_id: 1 }, { block_id: "../other" }, { block_id: id.toUpperCase().replace("184", "ABC") },
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
  { block_id: "18400000-0000-4000-8000-000000000012" }, { kind: "generic_link" }, { is_visible: "true" }, { position: 0 }, { position: 2147483648 },
  { payload_state: "missing" }, { payload_state: "not_implemented", contact_working: null }, { contact_working: null },
  ...[{}, { contact_type: "email" }, { contact_type: "social", label: null, value: "Private" },
    { contact_type: "email", label: 1, value: "Private" }, { contact_type: "email", label: null, value: 1 },
    { contact_type: "email", label: "🙂".repeat(513), value: "Private" },
    { contact_type: "email", label: null, value: "🙂".repeat(2049) },
    { contact_type: "email", label: String.fromCharCode(0), value: "Private" },
    { contact_type: "email", label: null, value: String.fromCharCode(0) },
    ...["owner_id", "kind", "href", "action", "issues", "normalized_value", "safe", "country", "published", "created_at"].map(key =>
      ({ contact_type: "email", label: null, value: "Private", [key]: "untrusted" })),
  ].map(contact_working => ({ contact_working })),
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
  const input = { ...request }; const pending = f.reader.read(input); input.block_id = "18400000-0000-4000-8000-000000000012";
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
