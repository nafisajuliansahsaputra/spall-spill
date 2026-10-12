import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerProfileWorkingReader } from "./owner-profile-working";
const payload = { status: "success", current_handle: "current-owner", primary_use_case: "business", profile_working: { display_name: "Private Owner", bio: null, profile_asset_key: null, revision: 1 } };
function fixture() {
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    expect(String(input)).toBe("https://home-fixture.example.test/rest/v1/rpc/resolve_current_owner_profile_working");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({});
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://home-fixture.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { reader: createOwnerProfileWorkingReader(client), fetcher };
}
afterEach(() => vi.useRealTimers());
it.each(["creator", "affiliate", "business", "personal", "other"])("reads %s personalization without treating it as capability", async primary_use_case => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload, primary_use_case })));
  expect(await f.reader.read()).toEqual({ ...payload, primary_use_case }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("uses the pinned SDK with no caller target or metadata arguments", async () => {
  const f = fixture(); expect(await f.reader.read()).toEqual(payload); expect(f.fetcher).toHaveBeenCalledTimes(1);
  expect(Object.keys((await f.reader.read())!)).toEqual(["status", "current_handle", "primary_use_case", "profile_working"]);
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

it.each([
  { display_name: "🙂".repeat(80), bio: "🙂".repeat(300), profile_asset_key: "🙂".repeat(512) },
  { bio: "First" + String.fromCharCode(10) + "Second", profile_asset_key: " opaque-key " },
])("preserves persisted Unicode/code-point lengths and opaque references %j", async fields => {
  const f = fixture(); const data = { ...payload, profile_working: { ...payload.profile_working, ...fields } };
  f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data))); expect(await f.reader.read()).toEqual(data);
});
it.each([
  { display_name: "" }, { display_name: " owner" }, { display_name: "🙂".repeat(81) },
  { bio: "" }, { bio: "🙂".repeat(301) }, { bio: "tab" + String.fromCharCode(9) + "inside" },
  { profile_asset_key: "" }, { profile_asset_key: "🙂".repeat(513) },
  { profile_asset_key: "bad" + String.fromCharCode(0) },
  { revision: 0 }, { revision: 1.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 },
  { owner_id: "private" }, { published: true },
])("rejects malformed/private nested profile %j", async fields => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload,
    profile_working: { ...payload.profile_working, ...fields } })));
  expect(await f.reader.read()).toBeNull();
});
it("requires explicit nullable fields instead of fabricating empty profile", async () => {
  const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...payload,
    profile_working: { display_name: "Private Owner", revision: 1 } })));
  expect(await f.reader.read()).toBeNull();
});
