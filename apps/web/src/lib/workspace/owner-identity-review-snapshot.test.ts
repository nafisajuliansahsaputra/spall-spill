import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerIdentityReviewSnapshot, createOwnerIdentityReviewSnapshotPageReader } from "./owner-identity-review-snapshot";

const subject = "25200000-0000-4000-8000-000000000001";
const owner = "25200000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "review-owner", primary_use_case: "personal" };
const row = { block_id: "25200000-0000-4000-8000-000000000011", kind: "text", position: 1,
  is_visible: true, payload_state: "present", working: { kind: "text", text: " <Private Text> " }, media_asset_state: null, destination_safety: null };
const page = { ...context, snapshot_hash: "a".repeat(64), review_format: "identity_working_review_v1", profile_working: { display_name: "Identity <Raw>", bio: "Private\nBio", profile_asset_key: null, revision: 2 },
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
    if (rpc === "resolve_current_owner_identity_review_snapshot") {
      expect(Object.keys(body)).toEqual(["input_request"]);
      expect(Object.keys(body.input_request).sort()).toEqual(["after_position", "expected_collection_revision"]);
    } else expect(body).toEqual({});
    return Response.json(rpc === "resolve_current_owner_state" ? states.shift()
      : rpc === "resolve_current_owner_home_context" ? contexts.shift() : pages.shift());
  });
  const client = createClient("https://review.example.test", "test-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  return { read: createOwnerIdentityReviewSnapshotPageReader(client).read, assemble: createOwnerIdentityReviewSnapshot(client).read, pages, states, contexts, calls, fetcher, claims };
}
const start = { expected_collection_revision: null, after_position: null };
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it.each([0, 1, 100, 101, 1000])("validates a complete %i-row server snapshot through original per-page schemas and Owner proofs", async count => {
  const blocks = Array.from({ length: count }, (_, index) => ({ ...row, position: index + 1,
    block_id: `25200000-0000-4000-8000-${String(index + 100).padStart(12, "0")}` }));
  const f = fixture({ ...page, collection: { ...page.collection, blocks } });
  const result = await f.assemble(); expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error("fixture denied");
  expect(result.collection!.blocks).toHaveLength(count); expect(result.snapshot_hash).toBe(page.snapshot_hash);
  expect(result.review_format).toBe("identity_working_review_v1"); expect(result.publication_comparison).toBe("not_assessed");
  expect(f.claims).toHaveBeenCalledTimes(3); expect(f.calls).toHaveLength(7);
  expect(result.editable_profile.display_name).toBe(page.profile_text_working.display_name);
});
it("retains absent collection separately from initialized-empty", async () => {
  const result = await fixture({ ...page, collection: null, revision_vector: { ...page.revision_vector, blocks: null } }).assemble();
  expect(result.status).toBe("success"); if (result.status === "success") expect(result.collection).toBeNull();
});
it.each([null, "", "A".repeat(64), "a".repeat(64) + "\n", 1, "a".repeat(63)])("rejects malformed server digest %#", async snapshot_hash => {
  expect(await fixture({ ...page, snapshot_hash }).read(start)).toEqual({ status: "unavailable" });
});
it.each(["review_format", "snapshot_hash", "source_destination_safety", "revision_vector"])("rejects missing %s", async field => {
  const value: Record<string, unknown> = { ...page }; delete value[field];
  expect(await fixture(value).assemble()).toEqual({ status: "unavailable" });
});
it("enforces global membership uniqueness/order across chunk boundaries and maximum capacity", async () => {
  const blocks = Array.from({ length: 101 }, (_, index) => ({ ...row, position: index + 1,
    block_id: `25200000-0000-4000-8000-${String(index + 100).padStart(12, "0")}` }));
  for (const last of [{ ...blocks[100]!, block_id: blocks[0]!.block_id }, { ...blocks[100]!, position: 99 },
    { ...blocks[100]!, working: { kind: "text", text: null }, payload_state: "missing" }]) {
    expect(await fixture({ ...page, collection: { ...page.collection, blocks: [...blocks.slice(0, 100), last] } }).read(start)).toEqual({ status: "unavailable" });
  }
  expect(await fixture({ ...page, collection: { ...page.collection, blocks: Array.from({ length: 1001 }, () => row) } }).read(start)).toEqual({ status: "unavailable" });
});
it.each([
  { ...page, owner_id: owner }, { ...page, review_format: "onboarding" },
  { ...page, collection: { ...page.collection, has_more: true } },
  { ...page, collection: { ...page.collection, next_after_position: 1 } },
  { ...page, profile_text_state: "source" }, { ...page, revision_vector: { ...page.revision_vector, profile_text: 99 } },
  { ...page, collection: { ...page.collection, blocks: [{ ...row, destination_safety: { status: "safe", revision: 1, expires_at: "2099-01-01T00:00:00Z" } }] } },
])("retains strict original graph/safety/format/terminal refinements %#", async value => {
  expect(await fixture(value).assemble()).toEqual({ status: "unavailable" });
});
it.each(["hash", "raw", "safety"])("rejects changed %s between complete statements", async field => {
  const f = fixture(); f.pages[1] = field === "hash" ? { ...page, snapshot_hash: "b".repeat(64) }
    : field === "raw" ? { ...page, profile_text_working: { ...page.profile_text_working, bio: "Changed" } }
      : { ...page, source_destination_safety: { status: "safe", revision: 1, expires_at: "2099-01-01T00:00:00Z" } };
  expect(await f.assemble()).toEqual({ status: "unavailable" });
});
it.each([0, 1, 2])("returns no private snapshot on restriction at proof %i", async phase => {
  const f = fixture(); f.states[phase] = { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.assemble()).toEqual({ status: "restricted" });
});
it("rejects actor rebinding and unauthenticated requests", async () => {
  const f = fixture(); f.states[2] = { ...active, owner_id: subject };
  expect(await f.assemble()).toEqual({ status: "unavailable" });
  const anonymous = fixture(); anonymous.claims.mockResolvedValue({ data: null, error: null } as never);
  expect(await anonymous.assemble()).toEqual({ status: "unauthenticated" }); expect(anonymous.fetcher).not.toHaveBeenCalled();
});
it("keeps the fixed response byte envelope", async () => {
  const f = fixture(); const long = { ...row, working: { kind: "text", text: "x".repeat(16384) } };
  f.pages.fill({ ...page, collection: { ...page.collection, blocks: Array.from({ length: 600 }, (_, i) => ({ ...long, position: i + 1 })) } });
  expect(await f.assemble()).toEqual({ status: "unavailable" });
});
it("keeps the aggregate deadline and ignores late claims", async () => {
  vi.useFakeTimers(); const f = fixture(); let release!: (value: never) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const result = f.assemble(); await vi.advanceTimersByTimeAsync(5000); expect(await result).toEqual({ status: "unavailable" });
  release({ data: { claims: { sub: subject } }, error: null } as never); await vi.advanceTimersByTimeAsync(1);
  expect(f.fetcher).not.toHaveBeenCalled();
});
