import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerPersistedIdentityWorking, createOwnerPersistedIdentityWorkingPageReader } from "./owner-persisted-identity-working";

const subject = "24500000-0000-4000-8000-000000000001";
const owner = "24500000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "identity-owner", primary_use_case: "personal" };
const start = { expected_collection_revision: null, after_position: null };
const source = { connection_kind: "generic_link", social_platform: null, destination_url: "HTTPS://Private.example.test/Keep?X=1#Exact", revision: 3 };
const row = { block_id: "24500000-0000-4000-8000-000000000011", kind: "text", position: 1,
  is_visible: false, payload_state: "present", working: { kind: "text", text: " <Private Text> " }, media_asset_state: null };
const page = { ...context, profile_working: { display_name: "Identity <Raw>", bio: "Private\nBio", profile_asset_key: null, revision: 2 },
  layout_working: { starter_key: "social_focus", revision: 7 }, connection_source_working: source,
  legacy_identity_work: "unchanged", publication_comparison: "not_assessed",
  revision_vector: { profile: 2, layout: 7, connection: 3, blocks: 4 },
  collection: { revision: 4, blocks: [row], has_more: false, next_after_position: null } };
function fixture() {
  const states: unknown[] = [active, active, active]; const pages: unknown[] = [page, page]; const calls: string[] = []; const requests: unknown[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(new URL(String(url)).origin).toBe("https://identity.example.test");
    expect(options!.method).toBe("POST"); expect(options!.signal).toBeDefined();
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    const rpc = String(url).split("/").at(-1)!; calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === "resolve_current_owner_identity_working_page") {
      expect(Object.keys(body)).toEqual(["input_request"]); requests.push(body.input_request);
    } else expect(body).toEqual({});
    return Response.json(rpc === "resolve_current_owner_state" ? states.shift()
      : rpc === "resolve_current_owner_home_context" ? context : pages.shift());
  });
  const client = createClient("https://identity.example.test", "test-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  return { read: createOwnerPersistedIdentityWorkingPageReader(client).read, assemble: createOwnerPersistedIdentityWorking(client).read,
    pages, states, calls, requests, fetcher, claims };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("returns persisted profile/layout/source/typed blocks/vector without a whole-publication claim", async () => {
  const f = fixture(); const result = await f.assemble(); expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error("fixture denied");
  expect(result.profile_working).toEqual(page.profile_working); expect(result.layout_working).toEqual(page.layout_working);
  expect(result.connection_source_working).toEqual(source); expect(result.revision_vector).toEqual(page.revision_vector);
  expect(result.publication_comparison).toBe("not_assessed"); expect(result.legacy_identity_work).toBe("unchanged");
  expect(result.collection).toEqual({ revision: 4, blocks: [{ ...row, issues: [] }] });
  expect(f.claims).toHaveBeenCalledTimes(3); expect(f.calls).toHaveLength(7);
  expect(f.requests).toEqual([start, start]);
});
it.each([null, { revision: 4, blocks: [], has_more: false, next_after_position: null }])("retains missing vs initialized-empty collection %#", async collection => {
  const f = fixture(); f.pages.fill({ ...page, collection, connection_source_working: null,
    revision_vector: { ...page.revision_vector, connection: null, blocks: collection?.revision ?? null } });
  const result = await f.assemble(); expect(result.status).toBe("success");
  if (result.status === "success") { expect(result.connection_source_working).toBeNull(); expect(result.collection).toEqual(collection === null ? null : { revision: 4, blocks: [] }); }
});
it.each(["profile", "layout", "connection", "blocks"])("rejects mismatched %s revision vector", async field => {
  const f = fixture(); f.pages[0] = { ...page, revision_vector: { ...page.revision_vector, [field]: 99 } };
  expect(await f.read(start)).toEqual({ status: "unavailable" });
});
it.each(["profile_working", "layout_working", "connection_source_working", "revision_vector", "publication_comparison"])("never fabricates missing %s", async field => {
  const f = fixture(); const value = { ...page } as Record<string, unknown>; delete value[field]; f.pages[0] = value;
  expect(await f.assemble()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each(["up_to_date", "published", "unpublished_changes", null])("rejects caller/provider inferred whole-publication comparison %j", async publication_comparison => {
  const f = fixture(); f.pages[0] = { ...page, publication_comparison }; expect(await f.read(start)).toEqual({ status: "unavailable" });
});
it.each(["owner_id", "identity_work", "published_snapshot", "capability_role"])("rejects extra private or ambiguous root field %s", async field => {
  const f = fixture(); f.pages[0] = { ...page, [field]: "forged" }; expect(await f.read(start)).toEqual({ status: "unavailable" });
});
it.each(["profile", "layout", "source"])("root %s change between complete observations retains no partial handoff", async field => {
  const f = fixture(); f.pages[1] = { ...page,
    ...(field === "profile" ? { profile_working: { ...page.profile_working, display_name: "Changed private profile" } }
      : field === "layout" ? { layout_working: { ...page.layout_working, starter_key: "business" } }
        : { connection_source_working: { ...source, destination_url: "https://changed.example.test" } }),
  };
  expect(await f.assemble()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(2);
});
it.each([0, 1, 2])("restriction at proof %s discards all profile and block data", async phase => {
  const f = fixture(); f.states[phase] = { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.assemble()).toEqual({ status: "restricted" });
});
it("root changes across pages are rejected before a complete observation is accepted", async () => {
  const f = fixture();
  const blocks = Array.from({ length: 100 }, (_, i) => ({ ...row, block_id: `24500000-0000-4000-8000-${String(i + 10).padStart(12, "0")}`, position: i + 1 }));
  f.pages[0] = { ...page, collection: { ...page.collection, blocks, has_more: true, next_after_position: 100 } };
  f.pages[1] = { ...page, profile_working: { ...page.profile_working, display_name: "Changed between pages" },
    collection: { ...page.collection, blocks: [{ ...row, position: 101, block_id: owner }] } };
  expect(await f.assemble()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(1);
  expect(f.requests).toEqual([start, { expected_collection_revision: 4, after_position: 100 }]);
});
it("invalid request selectors never invoke the new root RPC", async () => {
  const f = fixture(); expect(await f.read({ ...start, owner_id: owner })).toEqual({ status: "invalid_page_request" }); expect(f.calls).toEqual([]);
});
it("ignored page deadline aborts without leaking a partial profile", async () => {
  vi.useFakeTimers(); const f = fixture(); let signal: AbortSignal | null | undefined;
  f.fetcher.mockImplementation((_url, options) => new Promise(() => { signal = options?.signal; }));
  const pending = f.read(start); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: "unavailable" }); expect(signal?.aborted).toBe(true);
});
