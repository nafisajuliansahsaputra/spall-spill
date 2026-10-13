import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerCompositionWorkingReader } from "./owner-composition-working";
const payload = { status: "success", current_handle: "current-owner", primary_use_case: "business",
  profile_revision: 3, layout_working: { starter_key: "clean", revision: 2 }, connection_working: null,
  identity_work: "never_published" };
const slot = { connection_kind: "generic_link", social_platform: null, destination_url: "HTTPS://Private.example.test/Exact?x=1#Saved", revision: 4 };

function fixture() {
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    expect(String(input)).toBe("https://home-fixture.example.test/rest/v1/rpc/resolve_current_owner_composition_working");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({});
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://home-fixture.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { reader: createOwnerCompositionWorkingReader(client), fetcher };
}
afterEach(() => vi.useRealTimers());
it.each(["creator", "affiliate", "business", "personal", "other"])("reads %s personalization without treating it as capability", async primary_use_case => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, primary_use_case })));
  expect(await f.reader.read()).toEqual({ ...payload, primary_use_case }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("uses the pinned SDK with no caller target or metadata arguments", async () => {
  const f = fixture(); expect(await f.reader.read()).toEqual(payload); expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(Object.keys((await f.reader.read())!)).toEqual(["status", "current_handle", "primary_use_case", "profile_revision", "layout_working", "connection_working", "identity_work"]);
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

it.each(["clean", "social_focus", "featured", "business"])("preserves existing %s layout", async starter_key => {
  const f = fixture(); const data = { ...payload, layout_working: { starter_key, revision: Number.MAX_SAFE_INTEGER } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data))); expect(await f.reader.read()).toEqual(data);
});
it.each(["never_published", "unchanged", "unpublished_changes"])("preserves private comparison %s without public readiness", async identity_work => {
  const f = fixture(); const data = { ...payload, identity_work };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data))); expect(await f.reader.read()).toEqual(data);
});
it.each([slot, { ...slot, connection_kind: "social", social_platform: "custom_platform-1" },
  { ...slot, destination_url: "https://example.test/" + "🙂".repeat(2000) },
])("preserves exact private connection %j without opening it", async connection_working => {
  const f = fixture(); const data = { ...payload, connection_working };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data))); expect(await f.reader.read()).toEqual(data);
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  { profile_revision: 0 }, { profile_revision: 1.5 }, { profile_revision: Number.MAX_SAFE_INTEGER + 1 },
  { profile_revision: "3" }, { profile_revision: undefined }, { identity_work: "live" },
  { identity_work: undefined }, { connection_working: undefined }, { blocks: [] },
  { layout_working: null }, { layout_working: { starter_key: "theme", revision: 1 } },
  { layout_working: { starter_key: "clean", revision: 0 } },
  { layout_working: { starter_key: "clean", revision: Number.MAX_SAFE_INTEGER + 1 } },
  { layout_working: { starter_key: "clean", revision: 1, owner_id: "private" } },
])("rejects missing/unsafe/unowned composition %j", async fields => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, ...fields })));
  expect(await f.reader.read()).toBeNull();
});
it.each([
  { connection_kind: "contact" }, { social_platform: "platform" },
  { connection_kind: "social", social_platform: null }, { connection_kind: "social", social_platform: "Platform" },
  { connection_kind: "social", social_platform: "x".repeat(41) },
  { destination_url: "javascript:alert(1)" }, { destination_url: "https:///missing" },
  { destination_url: " https://example.test" }, { destination_url: "https://example.test/a b" },
  { destination_url: "https://example.test/" + String.fromCharCode(9) },
  { destination_url: "https://example.test/" + String.fromCharCode(127) },
  { destination_url: "https://example.test/" + String.fromCharCode(92) },
  { destination_url: "https://example.test/" + "🙂".repeat(2048) },
  { revision: 0 }, { revision: 1.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
  { block_id: "fabricated" }, { public_url: "https://example.test" },
])("rejects malformed/private connection %j", async fields => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload,
    connection_working: { ...slot, ...fields } })));
  expect(await f.reader.read()).toBeNull();
});
