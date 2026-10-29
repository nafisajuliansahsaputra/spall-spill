import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerIdentityWorkingReview } from "./owner-identity-working-review";

const subject = "25000000-0000-4000-8000-000000000001";
const owner = "25000000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "review-owner", primary_use_case: "personal" };
const row = { block_id: "25000000-0000-4000-8000-000000000011", kind: "text", position: 1,
  is_visible: true, payload_state: "present", working: { kind: "text", text: " <Private Text> " }, media_asset_state: null };
const page = { ...context, profile_working: { display_name: "Identity <Raw>", bio: "Private\nBio", profile_asset_key: null, revision: 2 },
  profile_text_working: { display_name: " <Raw name> ", bio: " <Raw bio>\r\n ", revision: 5, source_profile_revision: 2 }, profile_text_state: "saved",
  layout_working: { starter_key: "social_focus", revision: 7 },
  connection_source_working: { connection_kind: "generic_link", social_platform: null, destination_url: "https://private.example.test/Keep?X=1#Exact", revision: 3 },
  legacy_identity_work: "unchanged", publication_comparison: "not_assessed",
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
    if (rpc === "resolve_current_owner_editable_identity_working_page") {
      expect(Object.keys(body)).toEqual(["input_request"]);
      expect(Object.keys(body.input_request).sort()).toEqual(["after_position", "expected_collection_revision"]);
    } else expect(body).toEqual({});
    return Response.json(rpc === "resolve_current_owner_state" ? states.shift()
      : rpc === "resolve_current_owner_home_context" ? contexts.shift() : pages.shift());
  });
  const client = createClient("https://review.example.test", "test-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  return { review: createOwnerIdentityWorkingReview(client).review, pages, states, contexts, calls, fetcher, claims };
}
async function reviewed(initial: unknown = page) {
  const f = fixture(initial); const result = await f.review({ expected_content_digest: null });
  if (result.status !== "success") throw new Error(`Review denied: ${result.status}`);
  return { f, result };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("reads the actual full guarded handoff once and binds raw private content, not Publish authority", async () => {
  const { f, result } = await reviewed();
  expect(result.content_digest).toMatch(/^[0-9a-f]{64}$/); expect(result.content_digest).toHaveLength(64);
  expect(result.snapshot.editable_profile).toEqual({ display_name: " <Raw name> ", bio: " <Raw bio>\r\n ", profile_asset_key: null });
  expect(result.publication_assessment).toBe("pending");
  expect(result.pending_checks).toEqual([{ scope: "identity", code: "whole_identity_publication_validation" }, { scope: "identity", code: "source_destination_safety" }]);
  expect(f.claims).toHaveBeenCalledTimes(3);
  expect(f.calls).toEqual(["resolve_current_owner_state", "resolve_current_owner_home_context", "resolve_current_owner_editable_identity_working_page",
    "resolve_current_owner_state", "resolve_current_owner_home_context", "resolve_current_owner_editable_identity_working_page", "resolve_current_owner_state"]);
  expect(result.snapshot.publication_comparison).toBe("not_assessed");
});

it("rechecks the supplied digest through new proofs, with no cached graph or receipt", async () => {
  const { result } = await reviewed(); const f = fixture();
  expect(await f.review({ expected_content_digest: result.content_digest })).toEqual(result);
  expect(f.claims).toHaveBeenCalledTimes(3); expect(f.calls).toHaveLength(7);
  expect(await fixture().review({ expected_content_digest: "f".repeat(64) })).toEqual({ status: "stale_review" });
});

it.each([undefined, null, {}, [], "a".repeat(64), { expected_content_digest: 1 },
  { expected_content_digest: "A".repeat(64) }, { expected_content_digest: "a".repeat(63) },
  { expected_content_digest: "a".repeat(65) }, { expected_content_digest: "a".repeat(64) + "\n" },
  { expected_content_digest: null, owner_id: owner }, { expected_content_digest: null, ready: true },
  { expected_content_digest: null, revision_vector: page.revision_vector }, { expected_content_digest: null, snapshot: page },
])("rejects malformed/forged authority before I/O %#", async input => {
  const f = fixture(); expect(await f.review(input)).toEqual({ status: "invalid_review_request" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
});

const variants = [
  { ...page, profile_working: { ...page.profile_working, display_name: "Other source" } },
  { ...page, profile_working: { ...page.profile_working, bio: "Changed source bio" } },
  { ...page, profile_working: { ...page.profile_working, profile_asset_key: "25000000-0000-4000-8000-000000000021" } },
  { ...page, profile_text_working: { ...page.profile_text_working, display_name: "<Raw name>" } },
  { ...page, profile_text_working: { ...page.profile_text_working, bio: " <Raw bio>\n " } },
  { ...page, profile_text_working: { ...page.profile_text_working, bio: "é" } },
  { ...page, profile_text_working: { ...page.profile_text_working, bio: "e\u0301" } },
  { ...page, profile_text_working: { ...page.profile_text_working, source_profile_revision: 1 }, profile_text_state: "source_changed" },
  { ...page, profile_text_working: null, profile_text_state: "source", revision_vector: { ...page.revision_vector, profile_text: null } },
  { ...page, layout_working: { ...page.layout_working, starter_key: "business" } },
  { ...page, connection_source_working: { ...page.connection_source_working, destination_url: "https://private.example.test/Keep?X=2#Exact" } },
  { ...page, connection_source_working: null, revision_vector: { ...page.revision_vector, connection: null } },
  { ...page, collection: null, revision_vector: { ...page.revision_vector, blocks: null } },
  { ...page, collection: { ...page.collection, blocks: [] } },
  { ...page, collection: { ...page.collection, blocks: [{ ...row, is_visible: false }] } },
  { ...page, collection: { ...page.collection, blocks: [{ ...row, position: 2 }] } },
  { ...page, collection: { ...page.collection, blocks: [{ ...row, block_id: "25000000-0000-4000-8000-000000000012" }] } },
  { ...page, collection: { ...page.collection, blocks: [{ ...row, working: { ...row.working, text: "Changed text" } }] } },
  { ...page, collection: { ...page.collection, blocks: [{ ...row, working: null, payload_state: "missing" }] } },
  { ...page, profile_working: { ...page.profile_working, revision: 3 }, revision_vector: { ...page.revision_vector, profile: 3 }, profile_text_state: "source_changed" },
  { ...page, profile_text_working: { ...page.profile_text_working, revision: 6 }, revision_vector: { ...page.revision_vector, profile_text: 6 } },
  { ...page, layout_working: { ...page.layout_working, revision: 8 }, revision_vector: { ...page.revision_vector, layout: 8 } },
  { ...page, connection_source_working: { ...page.connection_source_working, revision: 4 }, revision_vector: { ...page.revision_vector, connection: 4 } },
  { ...page, collection: { ...page.collection, revision: 5 }, revision_vector: { ...page.revision_vector, blocks: 5 } },
];
it.each(variants)("rejects changed whole content/vector even when other revisions match %#", async value => {
  const { result } = await reviewed(); const f = fixture(value);
  expect(await f.review({ expected_content_digest: result.content_digest })).toEqual({ status: "stale_review" });
  expect(f.claims).toHaveBeenCalledTimes(3);
});

it("is invariant to JSON key order, but not Unicode or raw whitespace normalization", async () => {
  const { result } = await reviewed();
  const reordered = Object.fromEntries(Object.entries(page).reverse());
  expect((await reviewed(reordered)).result.content_digest).toBe(result.content_digest);
  expect((await reviewed(variants[5])).result.content_digest).not.toBe((await reviewed(variants[6])).result.content_digest);
});

it("never uses legacy source-only comparison as whole-document review identity", async () => {
  const { result } = await reviewed();
  expect((await reviewed({ ...page, legacy_identity_work: "unpublished_changes" })).result.content_digest).toBe(result.content_digest);
});

const payloads = [
  { ...row, kind: "social", working: { kind: "social", title: null, social_platform: "instagram", destination_url: "https://example.test" } },
  { ...row, kind: "generic_link", working: { kind: "generic_link", title: "Link", social_platform: null, destination_url: "https://example.test" } },
  { ...row, kind: "contact", working: { kind: "contact", contact_type: "email", label: null, value: "person@example.test" } },
  { ...row, kind: "media", working: { kind: "media", asset_key: "25000000-0000-4000-8000-000000000021", alt_text: null }, media_asset_state: "registered" },
  row,
  { ...row, kind: "spill_cta", working: { kind: "spill_cta", target: "owner_spill" } },
];
it("retains all six block kinds and explicit unresolved active transport requirements", async () => {
  const blocks = payloads.map((value, index) => ({ ...value, position: index + 1, block_id: `25000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}` }));
  const { result } = await reviewed({ ...page, collection: { ...page.collection, blocks } });
  expect(result.snapshot.collection!.blocks.map(value => value.kind)).toEqual(blocks.map(value => value.kind));
  expect(result.pending_checks.filter(value => value.scope === "block").map(value => value.code)).toEqual([
    "destination_safety", "destination_safety", "contact_target_policy", "media_public_delivery", "public_spill_eligibility",
  ]);
  expect(result.publication_assessment).toBe("pending");
});
it.each(payloads)("visible missing payload is explicit, never silently omitted %#", async value => {
  const { result } = await reviewed({ ...page, collection: { ...page.collection, blocks: [{ ...value, working: null, payload_state: "missing", media_asset_state: value.kind === "media" ? "not_selected" : null }] } });
  expect(result.pending_checks).toContainEqual({ scope: "block", block_id: row.block_id, code: "payload_missing" });
  expect(result.snapshot.collection!.blocks).toHaveLength(1);
});
it("retains hidden invalid content and diagnostics in review/digest without an active transport requirement", async () => {
  const hidden = { ...payloads[1]!, is_visible: false, working: { kind: "generic_link", title: null, social_platform: null, destination_url: "javascript:alert(1)" } };
  const value = { ...page, profile_text_working: { ...page.profile_text_working, display_name: null }, collection: { ...page.collection, blocks: [hidden] } };
  const { result } = await reviewed(value);
  expect(result.snapshot.profile_text_issues).toContainEqual({ field: "display_name", code: "display_name_required" });
  expect(result.snapshot.collection!.blocks[0]!.issues).toContainEqual({ field: "destination_url", code: "destination_invalid" });
  expect(result.pending_checks.filter(check => check.scope === "block")).toEqual([]);
  const changed = fixture({ ...value, collection: { ...value.collection, blocks: [{ ...hidden, working: { ...hidden.working, destination_url: null } }] } });
  expect(await changed.review({ expected_content_digest: result.content_digest })).toEqual({ status: "stale_review" });
});
it("includes source drift/photo gates and never promotes registry presence into public media evidence", async () => {
  const value = { ...page, profile_working: { ...page.profile_working, profile_asset_key: "25000000-0000-4000-8000-000000000021" },
    profile_text_working: { ...page.profile_text_working, source_profile_revision: 1 }, profile_text_state: "source_changed",
    collection: { ...page.collection, blocks: [payloads[3]!] } };
  const { result } = await reviewed(value);
  expect(result.pending_checks).toContainEqual({ scope: "identity", code: "profile_source_review" });
  expect(result.pending_checks).toContainEqual({ scope: "identity", code: "profile_media_public_delivery" });
  const f = fixture({ ...value, collection: { ...value.collection, blocks: [{ ...payloads[3]!, media_asset_state: "unavailable" }] } });
  expect(await f.review({ expected_content_digest: result.content_digest })).toEqual({ status: "stale_review" });
});

it.each([0, 1, 2])("returns no private review when restricted at proof %i", async phase => {
  const f = fixture(); f.states[phase] = { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.review({ expected_content_digest: null })).toEqual({ status: "restricted" });
});
it.each([1, 2])("rejects Owner/actor rebinding at proof %i", async phase => {
  const f = fixture(); f.states[phase] = { ...active, owner_id: "25000000-0000-4000-8000-000000000003" };
  expect(await f.review({ expected_content_digest: null })).toEqual({ status: "unavailable" });
});
it("does not disclose content after session loss", async () => {
  const f = fixture(); f.claims.mockResolvedValueOnce({ data: { claims: { sub: subject } }, error: null } as never)
    .mockResolvedValue({ data: null, error: new Error("private provider detail") } as never);
  expect(await f.review({ expected_content_digest: null })).toEqual({ status: "unauthenticated" });
});
it("does not turn disagreement between complete observations into a fresh review", async () => {
  const f = fixture(); f.pages[1] = variants[3];
  expect(await f.review({ expected_content_digest: null })).toEqual({ status: "unavailable" });
});
it("copies review precondition before await and does not retry after stale", async () => {
  const f = fixture(); const input = { expected_content_digest: "f".repeat(64) as string | null };
  const result = f.review(input); input.expected_content_digest = null;
  expect(await result).toEqual({ status: "stale_review" }); expect(f.calls).toHaveLength(7);
});
function pagedFixture(count: number, changedLast = false) {
  const f = fixture();
  const blocks = Array.from({ length: count }, (_, i) => ({ ...row, position: i + 1,
    block_id: `25000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
    working: { kind: "text", text: changedLast && i === count - 1 ? "Changed last page" : `Private ${i}` } }));
  const pages = Array.from({ length: Math.ceil(count / 100) }, (_, i) => ({ ...page,
    collection: { ...page.collection, blocks: blocks.slice(i * 100, (i + 1) * 100),
      has_more: (i + 1) * 100 < count, next_after_position: (i + 1) * 100 < count ? (i + 1) * 100 : null } }));
  f.pages.splice(0, f.pages.length, ...pages, ...pages);
  return { ...f, generatedPages: pages };
}
it("binds every page through the maximum 1000-row graph and detects a last-page equal-revision edit", async () => {
  const f = pagedFixture(1000); const first = await f.review({ expected_content_digest: null });
  expect(first.status).toBe("success"); if (first.status !== "success") throw new Error("fixture denied");
  expect(first.snapshot.collection!.blocks).toHaveLength(1000); expect(f.calls).toHaveLength(25);
  expect(await pagedFixture(1000, true).review({ expected_content_digest: first.content_digest })).toEqual({ status: "stale_review" });
});
it("rejects changed final-page raw data between complete observations rather than emitting a partial review", async () => {
  const f = pagedFixture(101); const last = f.generatedPages[1]!;
  f.pages[3] = { ...last, collection: { ...last.collection, blocks: [{ ...last.collection.blocks[0]!, working: { kind: "text", text: "Changed" } }] } };
  expect(await f.review({ expected_content_digest: null })).toEqual({ status: "unavailable" });
});
it("rejects changed root metadata within a multi-page traversal", async () => {
  const f = pagedFixture(101); const last = f.generatedPages[1]!;
  f.pages[1] = { ...last, profile_text_working: { ...page.profile_text_working, bio: "Changed" } };
  expect(await f.review({ expected_content_digest: null })).toEqual({ status: "unavailable" });
  expect(f.claims).toHaveBeenCalledTimes(1);
});
it("distinguishes reordered members and changed raw content of each non-Text block kind", async () => {
  const blocks = payloads.map((value, index) => ({ ...value, position: index + 1,
    block_id: `25000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}` }));
  const initial = { ...page, collection: { ...page.collection, blocks } };
  const { result } = await reviewed(initial);
  const reordered = { ...initial, collection: { ...initial.collection, blocks: [...blocks].reverse().map((value, index) => ({ ...value, position: index + 1 })) } };
  expect(await fixture(reordered).review({ expected_content_digest: result.content_digest })).toEqual({ status: "stale_review" });
  const changes = [
    { ...blocks[0]!, working: { ...payloads[0]!.working, social_platform: "other" } },
    { ...blocks[1]!, working: { ...payloads[1]!.working, title: "Other" } },
    { ...blocks[2]!, working: { ...payloads[2]!.working, value: "other@example.test" } },
    { ...blocks[3]!, working: { ...payloads[3]!.working, alt_text: "Other" } },
    { ...blocks[4]!, working: { kind: "text", text: null } },
    { ...blocks[5]!, working: null, payload_state: "missing" },
  ];
  for (const [index, changed] of changes.entries()) {
    const next = { ...initial, collection: { ...initial.collection, blocks: blocks.map((value, i) => i === index ? changed : value) } };
    expect(await fixture(next).review({ expected_content_digest: result.content_digest })).toEqual({ status: "stale_review" });
  }
});
it.each(["current_handle", "primary_use_case"])("binds fresh valid %s context and rejects mismatch", async field => {
  const nextContext = { ...context, [field]: field === "current_handle" ? "other-owner-handle" : "business" };
  const value = { ...page, ...nextContext }; const { result } = await reviewed();
  const f = fixture(value); f.contexts.fill(nextContext);
  expect(await f.review({ expected_content_digest: result.content_digest })).toEqual({ status: "stale_review" });
  expect(await fixture(value).review({ expected_content_digest: null })).toEqual({ status: "unavailable" });
});
it("distinguishes absent collection from initialized empty and absent recovery from all-null saved recovery", async () => {
  const missing = { ...page, collection: null, revision_vector: { ...page.revision_vector, blocks: null } };
  const empty = { ...page, collection: { ...page.collection, blocks: [] } };
  const { result } = await reviewed(missing);
  expect(await fixture(empty).review({ expected_content_digest: result.content_digest })).toEqual({ status: "stale_review" });
  const absent = { ...page, profile_text_working: null, profile_text_state: "source", revision_vector: { ...page.revision_vector, profile_text: null } };
  const saved = { ...page, profile_text_working: { ...page.profile_text_working, display_name: null, bio: null } };
  const initial = await reviewed(absent);
  expect(await fixture(saved).review({ expected_content_digest: initial.result.content_digest })).toEqual({ status: "stale_review" });
});
it("does not issue a review for malformed extra fields or denial payloads", async () => {
  for (const value of [{ ...page, ready: true }, { status: "unavailable" }, { status: "stale_read" }, { status: "success" }]) {
    expect(await fixture(value).review({ expected_content_digest: null })).toEqual({ status: "unavailable" });
  }
});
it("fails closed on thrown provider detail and ignored late claims without starting more I/O", async () => {
  const bad = fixture(); bad.fetcher.mockRejectedValue(new Error("private provider detail"));
  expect(await bad.review({ expected_content_digest: null })).toEqual({ status: "unavailable" });
  vi.useFakeTimers(); const f = fixture(); let release!: (value: never) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const promise = f.review({ expected_content_digest: null });
  await vi.advanceTimersByTimeAsync(5000);
  expect(await promise).toEqual({ status: "unavailable" });
  release({ data: { claims: { sub: subject } }, error: null } as never);
  await vi.advanceTimersByTimeAsync(1); expect(f.fetcher).not.toHaveBeenCalled();
});
