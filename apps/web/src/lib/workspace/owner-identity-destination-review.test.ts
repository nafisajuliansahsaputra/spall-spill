import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerIdentityDestinationReview, createOwnerIdentityDestinationReviewPageReader } from "./owner-identity-destination-review";

const subject = "25100000-0000-4000-8000-000000000001";
const owner = "25100000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "review-owner", primary_use_case: "personal" };
const row = { block_id: "25100000-0000-4000-8000-000000000011", kind: "text", position: 1,
  is_visible: true, payload_state: "present", working: { kind: "text", text: " <Private Text> " }, media_asset_state: null, destination_safety: null };
const page = { ...context, profile_working: { display_name: "Identity <Raw>", bio: "Private\nBio", profile_asset_key: null, revision: 2 },
  profile_text_working: { display_name: " <Raw name> ", bio: " <Raw bio>\r\n ", revision: 5, source_profile_revision: 2 }, profile_text_state: "saved",
  layout_working: { starter_key: "social_focus", revision: 7 },
  connection_source_working: { connection_kind: "generic_link", social_platform: null, destination_url: "https://private.example.test/Keep?X=1#Exact", revision: 3 },
  source_destination_safety: { status: "pending", revision: null, expires_at: null }, legacy_identity_work: "unchanged", publication_comparison: "not_assessed",
  revision_vector: { profile: 2, profile_text: 5, layout: 7, connection: 3, blocks: 4 },
  collection: { revision: 4, blocks: [row], has_more: false, next_after_position: null } };
function fixture(initial: unknown = page) {
  const states: unknown[] = [active, active, active];
  const pages: unknown[] = [initial, initial]; const contexts: unknown[] = [context, context]; const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(new URL(String(url)).origin).toBe("https://review.example.test");
    expect(options!.method).toBe("POST"); expect(options!.signal).toBeDefined();
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    const rpc = String(url).split("/").at(-1)!; calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === "resolve_current_owner_identity_destination_review_page") {
      expect(Object.keys(body)).toEqual(["input_request"]);
      expect(Object.keys(body.input_request).sort()).toEqual(["after_position", "expected_collection_revision"]);
    } else expect(body).toEqual({});
    return Response.json(rpc === "resolve_current_owner_state" ? states.shift()
      : rpc === "resolve_current_owner_home_context" ? contexts.shift() : pages.shift());
  });
  const client = createClient("https://review.example.test", "test-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  return { read: createOwnerIdentityDestinationReviewPageReader(client).read, assemble: createOwnerIdentityDestinationReview(client).read, pages, states, contexts, calls, fetcher, claims };
}
const start = { expected_collection_revision: null, after_position: null };
const safe = { status: "safe", revision: 9, expires_at: "2099-01-01T00:00:00Z" };
const link = { ...row, kind: "generic_link", working: { kind: "generic_link", title: " Private link ", social_platform: null,
  destination_url: "https://private.example.test/Keep?X=1#Exact" }, destination_safety: safe };
const linkPage = { ...page, source_destination_safety: safe, collection: { ...page.collection, blocks: [link] } };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("reads exact stored source/active link safety with the full guarded editable graph", async () => {
  const f = fixture(linkPage); const result = await f.assemble(); expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error("fixture denied");
  expect(result.source_destination_safety).toEqual(safe); expect(result.collection!.blocks[0]!.destination_safety).toEqual(safe);
  expect(result.collection!.blocks[0]!.working).toEqual(link.working);
  expect(result.editable_profile).toEqual({ display_name: " <Raw name> ", bio: " <Raw bio>\r\n ", profile_asset_key: null });
  expect(result.publication_comparison).toBe("not_assessed"); expect(f.claims).toHaveBeenCalledTimes(3); expect(f.calls).toHaveLength(7);
});
it.each(["pending", "safe", "review", "blocked"])("preserves stored %s as preview advice without Publish authority", async status => {
  const destination_safety = status === "pending" ? { status, revision: null, expires_at: null } : { ...safe, status };
  const result = await fixture({ ...linkPage, source_destination_safety: destination_safety,
    collection: { ...page.collection, blocks: [{ ...link, destination_safety }] } }).assemble();
  expect(result.status).toBe("success"); if (result.status === "success") expect(result.collection!.blocks[0]!.destination_safety).toEqual(destination_safety);
});
it.each(["source", "row"])("rejects %s safety drift without a Working revision change", async location => {
  for (const changed of [{ ...safe, status: "blocked" }, { ...safe, revision: 10 }, { ...safe, expires_at: "2099-01-02T00:00:00Z" },
    { status: "pending", revision: safe.revision, expires_at: safe.expires_at }]) {
    const f = fixture(linkPage); f.pages[1] = location === "source" ? { ...linkPage, source_destination_safety: changed }
      : { ...linkPage, collection: { ...page.collection, blocks: [{ ...link, destination_safety: changed }] } };
    expect(await f.assemble()).toEqual({ status: "unavailable" });
  }
});
it.each([null, {}, { status: "safe", revision: null, expires_at: null }, { ...safe, owner_id: owner },
  { ...safe, scanner_version: "private" }, { ...safe, status: "ready" }, { ...safe, revision: Number.MAX_SAFE_INTEGER + 1 },
])("rejects malformed source safety %#", async source_destination_safety => {
  expect(await fixture({ ...linkPage, source_destination_safety }).read(start)).toEqual({ status: "unavailable" });
});
it.each(["is_visible", "working", "destination_url"])("does not accept active link safety when %s makes it inapplicable", async field => {
  const block = field === "is_visible" ? { ...link, is_visible: false }
    : field === "working" ? { ...link, working: null, payload_state: "missing" }
      : { ...link, working: { ...link.working, destination_url: null } };
  expect(await fixture({ ...linkPage, collection: { ...page.collection, blocks: [block] } }).assemble()).toEqual({ status: "unavailable" });
  const result = await fixture({ ...linkPage, collection: { ...page.collection, blocks: [{ ...block, destination_safety: null }] } }).assemble();
  expect(result.status).toBe("success");
});
it("requires null source safety iff source is absent", async () => {
  const absent = { ...page, connection_source_working: null, revision_vector: { ...page.revision_vector, connection: null } };
  expect(await fixture(absent).assemble()).toEqual({ status: "unavailable" });
  expect((await fixture({ ...absent, source_destination_safety: null }).assemble()).status).toBe("success");
});
it.each([
  row,
  { ...row, kind: "contact", working: { kind: "contact", contact_type: "email", label: null, value: "a@example.test" } },
  { ...row, kind: "media", working: { kind: "media", asset_key: null, alt_text: null }, media_asset_state: "not_selected" },
  { ...row, kind: "spill_cta", working: { kind: "spill_cta", target: "owner_spill" } },
])("rejects safety attached to non-destination kind %#", async block => {
  expect(await fixture({ ...page, collection: { ...page.collection, blocks: [{ ...block, destination_safety: safe }] } }).assemble()).toEqual({ status: "unavailable" });
  expect((await fixture({ ...page, collection: { ...page.collection, blocks: [block] } }).assemble()).status).toBe("success");
});
it("keeps original strict payload/vector/paging/source recovery refinements", async () => {
  const values = [
    { ...page, revision_vector: { ...page.revision_vector, profile_text: 99 } },
    { ...page, profile_text_state: "source" },
    { ...page, collection: { ...page.collection, blocks: [{ ...row, payload_state: "missing" }] } },
    { ...page, collection: { ...page.collection, blocks: [row, row] } },
    { ...page, collection: { ...page.collection, has_more: true } },
    { ...linkPage, collection: { ...page.collection, blocks: [{ ...link, owner_id: owner }] } },
    { ...linkPage, collection: { ...page.collection, blocks: [{ ...link, working: { ...link.working, kind: "social" } }] } },
    { ...page, publication_comparison: "up_to_date" }, { ...page, ready: true },
  ];
  for (const value of values) expect(await fixture(value).assemble()).toEqual({ status: "unavailable" });
});
it.each([0, 1, 2])("withholds all safety/graph data after Owner restriction at proof %i", async phase => {
  const f = fixture(linkPage); f.states[phase] = { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.assemble()).toEqual({ status: "restricted" });
});
it("rejects rebinding, unauthenticated session and malformed input without resource disclosure", async () => {
  const f = fixture(); f.states[2] = { ...active, owner_id: "25100000-0000-4000-8000-000000000003" };
  expect(await f.assemble()).toEqual({ status: "unavailable" });
  const anonymous = fixture(); anonymous.claims.mockResolvedValue({ data: null, error: null } as never);
  expect(await anonymous.assemble()).toEqual({ status: "unauthenticated" }); expect(anonymous.fetcher).not.toHaveBeenCalled();
  const invalid = fixture(); expect(await invalid.read({ ...start, owner_id: owner })).toEqual({ status: "invalid_page_request" });
  expect(invalid.fetcher).not.toHaveBeenCalled();
});
it("rejects multi-page root safety drift and complete-observation last row safety drift", async () => {
  const blocks = Array.from({ length: 100 }, (_, i) => ({ ...link, position: i + 1, block_id: `25100000-0000-4000-8000-${String(i + 100).padStart(12, "0")}` }));
  const first = { ...linkPage, collection: { ...page.collection, blocks, has_more: true, next_after_position: 100 } };
  const last = { ...linkPage, collection: { ...page.collection, blocks: [{ ...link, position: 101 }], has_more: false, next_after_position: null } };
  const f = fixture(); f.pages.splice(0, 2, first, { ...last, source_destination_safety: { ...safe, revision: 10 } });
  expect(await f.assemble()).toEqual({ status: "unavailable" });
  const changed = { ...last, collection: { ...last.collection, blocks: [{ ...link, position: 101, destination_safety: { ...safe, status: "blocked" } }] } };
  const g = fixture(); g.pages.splice(0, 2, first, last, first, changed);
  expect(await g.assemble()).toEqual({ status: "unavailable" });
  const stable = fixture(); stable.pages.splice(0, 2, first, last, first, last);
  const result = await stable.assemble(); expect(result.status).toBe("success");
  if (result.status === "success") expect(result.collection!.blocks).toHaveLength(101);
});
it("keeps one aggregate deadline and ignores late provider responses", async () => {
  vi.useFakeTimers(); const f = fixture(); let release!: (value: never) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.assemble(); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  release({ data: { claims: { sub: subject } }, error: null } as never);
  await vi.advanceTimersByTimeAsync(1); expect(f.fetcher).not.toHaveBeenCalled();
});
