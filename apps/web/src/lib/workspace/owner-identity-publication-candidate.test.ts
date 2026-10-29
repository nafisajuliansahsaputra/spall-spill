import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerIdentityPublicationCandidate, identityProfileTextCandidateSchema } from "./owner-identity-publication-candidate";

const subject = "25300000-0000-4000-8000-000000000001";
const owner = "25300000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "review-owner", primary_use_case: "personal" };
const row = { block_id: "25300000-0000-4000-8000-000000000011", kind: "text", position: 1,
  is_visible: true, payload_state: "present", working: { kind: "text", text: " <Private Text> " }, media_asset_state: null, destination_safety: null };
const page = { ...context, snapshot_hash: "a".repeat(64), review_format: "identity_working_review_v1", profile_working: { display_name: "Identity <Raw>", bio: "Private\nBio", profile_asset_key: null, revision: 2 },
  profile_text_working: { display_name: " <Raw name> ", bio: " <Raw bio>\r\n ", revision: 5, source_profile_revision: 2 }, profile_text_state: "saved",
  layout_working: { starter_key: "social_focus", revision: 7 },
  connection_source_working: null,
  source_destination_safety: null, legacy_identity_work: "unchanged", publication_comparison: "not_assessed",
  revision_vector: { profile: 2, profile_text: 5, layout: 7, connection: null, blocks: 4 },
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
  return { prepare: (...values: unknown[]) => createOwnerIdentityPublicationCandidate(client).prepare(values.length ? values[0] : { expected_snapshot_hash: null }), pages, states, contexts, calls, fetcher, claims };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("prepares normalized Profile and exact plain Text from the actual complete guarded reader", async () => {
  const f = fixture(); const result = await f.prepare();
  expect(result.status).toBe("success"); if (result.status !== "success") throw new Error("fixture denied");
  expect(result.assessment).toBe("preview_prepared"); expect(result.publication_validation).toBe("not_assessed");
  expect(result.candidate).toEqual({ current_handle: "review-owner", display_name: "<Raw name>", bio: "<Raw bio>",
    starter_key: "social_focus", blocks: [{ kind: "text", text: " <Private Text> " }] });
  expect(result.snapshot_hash).toBe(page.snapshot_hash); expect(result.issues).toEqual([]);
  expect(f.claims).toHaveBeenCalledTimes(3); expect(f.calls).toHaveLength(7);
  expect(f.calls.every(value => ["resolve_current_owner_state", "resolve_current_owner_home_context", "resolve_current_owner_identity_review_snapshot"].includes(value))).toBe(true);
  expect(page.profile_text_working.bio).toBe(" <Raw bio>\r\n ");
});
it.each([null, undefined, {}, [], "publish", { expected_snapshot_hash: 1 },
  { expected_snapshot_hash: "A".repeat(64) }, { expected_snapshot_hash: "a".repeat(64) + "\n" },
  { expected_snapshot_hash: "a".repeat(63) }, { expected_snapshot_hash: null, owner_id: owner },
  { expected_snapshot_hash: null, snapshot: page }, { expected_snapshot_hash: null, receipt_id: owner },
  { expected_snapshot_hash: null, ready: true },
])("rejects malformed/caller authority %# before I/O", async value => {
  const f = fixture(); expect(await f.prepare(value)).toEqual({ status: "invalid_candidate_request" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
});
it("requires a fresh matching server hash before returning any candidate or issue data", async () => {
  expect((await fixture().prepare({ expected_snapshot_hash: page.snapshot_hash })).status).toBe("success");
  const f = fixture(); expect(await f.prepare({ expected_snapshot_hash: "b".repeat(64) })).toEqual({ status: "stale_review" });
  expect(f.claims).toHaveBeenCalledTimes(3);
  const input = { expected_snapshot_hash: "b".repeat(64) as string | null }; const copied = fixture();
  const pending = copied.prepare(input); input.expected_snapshot_hash = null; expect(await pending).toEqual({ status: "stale_review" });
});
it.each([
  [null, "display_name_invalid"], ["   ", "display_name_invalid"], ["x".repeat(81), "display_name_invalid"],
  ["Name\nOther", "display_name_invalid"], ["Name\u0085Other", "display_name_invalid"],
  ["Name\u2028Other", "display_name_invalid"], ["Name\u2029Other", "display_name_invalid"],
])("rejects invalid recoverable Display Name %# without raw content in issues", async (display_name, code) => {
  const f = fixture({ ...page, profile_text_working: { ...page.profile_text_working, display_name } });
  const result = await f.prepare(); expect(result.status).toBe("success");
  if (result.status === "success") { expect(result.assessment).toBe("blocked"); expect(result.candidate).toBeNull(); expect(result.issues).toEqual([{ scope: "profile", code }]); }
});
it.each(["x".repeat(301), "Bio\tOther", "Bio\u0085Other"])("rejects invalid Bio %# while preserving work", async bio => {
  const raw = { ...page.profile_text_working, bio }; const f = fixture({ ...page, profile_text_working: raw });
  const result = await f.prepare(); expect(result.status).toBe("success");
  if (result.status === "success") { expect(result.candidate).toBeNull(); expect(result.issues).toEqual([{ scope: "profile", code: "bio_invalid" }]); }
  expect(raw.bio).toBe(bio);
});
it("uses Unicode code points and canonical Bio normalization while keeping raw recovery separate", async () => {
  const raw = { ...page.profile_text_working, display_name: `  ${"😀".repeat(80)}  `, bio: "  line one\r\nline two\rline three  " };
  const result = await fixture({ ...page, profile_text_working: raw }).prepare(); expect(result.status).toBe("success");
  if (result.status === "success") {
    expect(result.assessment).toBe("preview_prepared"); expect(result.candidate?.display_name).toBe("😀".repeat(80));
    expect(result.candidate?.bio).toBe("line one\nline two\nline three");
  }
  expect(raw.bio).toContain("\r");
});
it.each([null, "", " \r\n\t "])("optional Bio %j prepares as null", async bio => {
  const result = await fixture({ ...page, profile_text_working: { ...page.profile_text_working, bio } }).prepare();
  expect(result.status).toBe("success"); if (result.status === "success") expect(result.candidate?.bio).toBeNull();
});
it("requires explicit source review instead of normalizing/rebasing drift away", async () => {
  const result = await fixture({ ...page, profile_text_working: { ...page.profile_text_working, source_profile_revision: 1 }, profile_text_state: "source_changed" }).prepare();
  expect(result.status).toBe("success"); if (result.status === "success") { expect(result.candidate).toBeNull(); expect(result.issues).toContainEqual({ scope: "profile", code: "source_review_required" }); }
});
it.each([null, "", " \n\r\t ", "hidden\u0001control", "del\u007f"])("visible invalid Text %# blocks the entire projection", async text => {
  const result = await fixture({ ...page, collection: { ...page.collection, blocks: [{ ...row, working: { kind: "text", text } }] } }).prepare();
  expect(result.status).toBe("success"); if (result.status === "success") { expect(result.candidate).toBeNull(); expect(result.issues).toEqual([{ scope: "block", block_id: row.block_id, code: "text_invalid" }]); }
});
it("keeps accepted multiline/markup/URL-looking Text as exact plain data without execution or linkification", async () => {
  const text = "  <script>throw new Error('literal')</script>\r\n\tjavascript:literal()  ";
  const result = await fixture({ ...page, collection: { ...page.collection, blocks: [{ ...row, working: { kind: "text", text } }] } }).prepare();
  expect(result.status).toBe("success"); if (result.status === "success") expect(result.candidate?.blocks).toEqual([{ kind: "text", text }]);
});
const unsupported = [
  { ...row, kind: "social", working: { kind: "social", title: null, social_platform: "instagram", destination_url: "https://example.test" }, destination_safety: { status: "safe", revision: 1, expires_at: "2099-01-01T00:00:00Z" } },
  { ...row, kind: "generic_link", working: { kind: "generic_link", title: "Link", social_platform: null, destination_url: "https://example.test" }, destination_safety: { status: "safe", revision: 1, expires_at: "2099-01-01T00:00:00Z" } },
  { ...row, kind: "contact", working: { kind: "contact", contact_type: "email", label: null, value: "a@example.test" } },
  { ...row, kind: "media", working: { kind: "media", asset_key: "25300000-0000-4000-8000-000000000021", alt_text: null }, media_asset_state: "registered" },
  { ...row, kind: "spill_cta", working: { kind: "spill_cta", target: "owner_spill" } },
];
it.each(unsupported)("visible supported-Working kind %# retains explicit unmet publication dependency", async block => {
  const result = await fixture({ ...page, collection: { ...page.collection, blocks: [block] } }).prepare();
  expect(result.status).toBe("success"); if (result.status === "success") {
    expect(result.assessment).toBe("blocked"); expect(result.candidate).toBeNull(); expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ scope: "block", block_id: block.block_id }); expect(result.publication_validation).toBe("not_assessed");
  }
});
it("requires photo/source dependencies even when a stored source verdict is safe", async () => {
  const value = { ...page, profile_working: { ...page.profile_working, profile_asset_key: "25300000-0000-4000-8000-000000000021" },
    connection_source_working: { connection_kind: "generic_link", social_platform: null, destination_url: "https://example.test", revision: 3 },
    source_destination_safety: { status: "safe", revision: 1, expires_at: "2099-01-01T00:00:00Z" }, revision_vector: { ...page.revision_vector, connection: 3 } };
  const result = await fixture(value).prepare(); expect(result.status).toBe("success");
  if (result.status === "success") { expect(result.candidate).toBeNull(); expect(result.issues).toEqual([
    { scope: "profile", code: "profile_media_publication_pending" }, { scope: "source_connection", code: "connection_publication_preparation_pending" },
  ]); }
});
it("never returns a partial candidate that drops active missing/blocked content", async () => {
  const blocks = [row, { ...row, block_id: owner, position: 2, working: null, payload_state: "missing" }];
  const result = await fixture({ ...page, collection: { ...page.collection, blocks } }).prepare();
  expect(result.status).toBe("success"); if (result.status === "success") { expect(result.candidate).toBeNull(); expect(result.issues).toEqual([{ scope: "block", block_id: owner, code: "payload_missing" }]); }
});
it("excludes hidden invalid/private content by explicit saved visibility without altering its stored graph", async () => {
  const hidden = unsupported.map((value, index) => ({ ...value, block_id: `25300000-0000-4000-8000-${String(index + 50).padStart(12, "0")}`,
    position: index + 1, is_visible: false, destination_safety: null }));
  const blocks = [...hidden, { ...row, position: 10 }]; const value = { ...page, collection: { ...page.collection, blocks } };
  const result = await fixture(value).prepare(); expect(result.status).toBe("success");
  if (result.status === "success") { expect(result.assessment).toBe("preview_prepared"); expect(result.candidate?.blocks).toEqual([{ kind: "text", text: row.working.text }]); }
  expect(value.collection.blocks).toHaveLength(6);
});
it("keeps public candidate free of private IDs, revisions, raw profile, safety and receipt metadata", async () => {
  const result = await fixture().prepare(); if (result.status !== "success" || result.candidate === null) throw new Error("fixture denied");
  expect(Object.keys(result.candidate).sort()).toEqual(["bio", "blocks", "current_handle", "display_name", "starter_key"]);
  const output = JSON.stringify(result.candidate);
  for (const token of [owner, row.block_id, "snapshot_hash", "receipt_id", "profile_asset_key", "revision", "profile_text", "safety", "position", "is_visible", "primary_use_case"]) expect(output).not.toContain(token);
  expect(identityProfileTextCandidateSchema.safeParse({ ...result.candidate, owner_id: owner }).success).toBe(false);
  expect(identityProfileTextCandidateSchema.safeParse({ ...result.candidate, current_handle: "valid-handle\n" }).success).toBe(false);
  expect(identityProfileTextCandidateSchema.safeParse({ ...result.candidate, display_name: " raw boundary " }).success).toBe(false);
  expect(identityProfileTextCandidateSchema.safeParse({ ...result.candidate, bio: "\ud800" }).success).toBe(false);
  expect(identityProfileTextCandidateSchema.safeParse({ ...result.candidate, blocks: [{ kind: "text", text: "\ud800" }] }).success).toBe(false);
});
it.each([0, 1, 2])("returns status only on Owner restriction at proof %i", async phase => {
  const f = fixture(); f.states[phase] = { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.prepare()).toEqual({ status: "restricted" });
});
it("rejects root/hash changes, actor rebinding, failed claims and provider exceptions", async () => {
  const changed = fixture(); changed.pages[1] = { ...page, snapshot_hash: "b".repeat(64) };
  expect(await changed.prepare()).toEqual({ status: "unavailable" });
  const rebound = fixture(); rebound.states[2] = { ...active, owner_id: subject }; expect(await rebound.prepare()).toEqual({ status: "unavailable" });
  const anonymous = fixture(); anonymous.claims.mockResolvedValue({ data: null, error: null } as never);
  expect(await anonymous.prepare()).toEqual({ status: "unauthenticated" }); expect(anonymous.fetcher).not.toHaveBeenCalled();
  const failed = fixture(); failed.fetcher.mockRejectedValue(new Error("private provider detail")); expect(await failed.prepare()).toEqual({ status: "unavailable" });
});
it("prepares bounded complete 1000-row Text output in saved order without any block metadata", async () => {
  const blocks = Array.from({ length: 1000 }, (_, i) => ({ ...row, position: i + 1,
    block_id: `25300000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`, working: { kind: "text", text: `Line ${i}` } }));
  const result = await fixture({ ...page, collection: { ...page.collection, blocks } }).prepare();
  expect(result.status).toBe("success"); if (result.status === "success") { expect(result.candidate?.blocks).toHaveLength(1000); expect(result.candidate?.blocks.at(-1)).toEqual({ kind: "text", text: "Line 999" }); }
});
it("keeps the reader deadline and ignores late claims without returning a projection", async () => {
  vi.useFakeTimers(); const f = fixture(); let release!: (value: never) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.prepare(); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  release({ data: { claims: { sub: subject } }, error: null } as never); await vi.advanceTimersByTimeAsync(1); expect(f.fetcher).not.toHaveBeenCalled();
});
