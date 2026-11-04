import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerProfileTextDbCandidate } from "./owner-profile-text-db-candidate-reader";
const subject = "25500000-0000-4000-8000-000000000001";
const owner = "25500000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "owner255", primary_use_case: "personal" };
const intent = { action: "prepare_identity_profile_text_candidate", receipt_id: subject, snapshot_hash: "a".repeat(64) };
const success = { status: "success", receipt_id: subject, snapshot_hash: intent.snapshot_hash, expires_at: "2099-01-01T00:00:00Z",
  review_format: "identity_working_review_v1", publication_validation: "profile_text_subset", assessment: "candidate_validated",
  candidate: { current_handle: context.current_handle, display_name: "Name", bio: null, starter_key: "clean", blocks: [{ kind: "text", text: "<literal>" }] }, issues: [] };
function fixture(value: unknown = success) {
  const states: unknown[] = [active, active, active]; const results: unknown[] = [value, value];
  const contexts: unknown[] = [context, context]; const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(new URL(String(url)).origin).toBe("https://candidate.example.test");
    expect(options!.signal).toBeDefined(); expect(options!.method).toBe("POST");
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    const rpc = String(url).split("/").at(-1)!; calls.push(rpc);
    expect(JSON.parse(String(options!.body))).toEqual(rpc === "prepare_current_owner_identity_profile_text_candidate" ? { input_candidate: intent } : {});
    if (rpc === "resolve_current_owner_state") return Response.json(states.shift());
    if (rpc === "resolve_current_owner_home_context") return Response.json(contexts.shift());
    expect(rpc).toBe("prepare_current_owner_identity_profile_text_candidate"); return Response.json(results.shift());
  });
  const client = createClient("https://candidate.example.test", "test-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  return { prepare: createOwnerProfileTextDbCandidate(client).prepare, states, results, contexts, calls, fetcher, claims };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("binds the exact receipt and DB candidate to three proofs and two current observations", async () => {
  const f = fixture(); expect(await f.prepare(intent)).toEqual(success);
  expect(f.claims).toHaveBeenCalledTimes(3); expect(f.calls).toHaveLength(7);
  expect(f.calls.filter(x => x === "prepare_current_owner_identity_profile_text_candidate")).toHaveLength(2);
});
it.each([null, {}, { ...intent, owner_id: owner }, { ...intent, action: "publish" }, { ...intent, snapshot_hash: "bad" }])("rejects invalid intent before any I/O %#", async value => {
  const f = fixture(); expect(await f.prepare(value)).toEqual({ status: "invalid_candidate_request" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
});
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_candidate_request", "stale_review", "review_expired"])("preserves stable status-only DB denial %s", async status => {
  const f = fixture({ status }); expect(await f.prepare(intent)).toEqual({ status }); expect(f.claims).toHaveBeenCalledTimes(3);
});
it("retains blockers without fabricating a partial candidate", async () => {
  const blocked = { ...success, assessment: "blocked", candidate: null, issues: [{ scope: "profile", code: "source_review_required" }] };
  expect(await fixture(blocked).prepare(intent)).toEqual(blocked);
});
it.each([null, {}, { ...success, owner_id: owner }, { ...success, receipt_id: owner }, { ...success, snapshot_hash: "b".repeat(64) },
  { ...success, expires_at: "2020-01-01T00:00:00Z" }, { ...success, candidate: { ...success.candidate, current_handle: "foreign-owner" } },
  { ...success, candidate: { ...success.candidate, bio: "x".repeat(8 * 1024 * 1024) } }])("denies malformed, mismatched, expired or oversized results %#", async value => {
  expect(await fixture(value).prepare(intent)).toEqual({ status: "unavailable" });
});
it.each(["receipt_id", "snapshot_hash", "expires_at", "candidate"])("denies observation drift in %s", async field => {
  const f = fixture(); f.results[1] = { ...success, [field]: field === "candidate" ? { ...success.candidate, bio: "Changed" }
    : field === "expires_at" ? "2098-01-01T00:00:00Z" : owner };
  expect(await f.prepare(intent)).toEqual({ status: "unavailable" });
});
it.each([0, 1, 2])("denies restriction and Owner/subject rebinding at proof %i", async phase => {
  const f = fixture(); f.states[phase] = { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.prepare(intent)).toEqual({ status: "restricted" });
  if (phase > 0) {
    const rebound = fixture(); rebound.states[phase] = { ...active, owner_id: subject };
    expect(await rebound.prepare(intent)).toEqual({ status: "unavailable" });
    const auth = fixture(); auth.claims.mockResolvedValueOnce({ data: { claims: { sub: subject } }, error: null } as never)
      .mockResolvedValue({ data: { claims: { sub: owner } }, error: null } as never);
    expect(await auth.prepare(intent)).toEqual({ status: "unavailable" });
  }
});
it("denies missing claims, unknown state and Home drift", async () => {
  const f = fixture(); f.claims.mockResolvedValue({ data: null, error: null } as never);
  expect(await f.prepare(intent)).toEqual({ status: "unauthenticated" }); expect(f.fetcher).not.toHaveBeenCalled();
  const unknown = fixture(); unknown.states[0] = { ...active, status: "admin" };
  expect(await unknown.prepare(intent)).toEqual({ status: "unavailable" });
  const home = fixture(); home.contexts[1] = { ...context, primary_use_case: "creator" };
  expect(await home.prepare(intent)).toEqual({ status: "unavailable" });
});
it("does not retry network/permission failures", async () => {
  for (const mode of ["network", "permission"]) {
    const f = fixture(); if (mode === "network") f.fetcher.mockRejectedValue(new Error("private"));
    else f.fetcher.mockResolvedValue(new Response("{}", { status: 403 }));
    expect(await f.prepare(intent)).toEqual({ status: "unavailable" }); expect(f.fetcher).toHaveBeenCalledTimes(1);
  }
});
it("rechecks expiry after the final proof", async () => {
  vi.useFakeTimers(); const now = Date.now(); const f = fixture({ ...success, expires_at: new Date(now + 1000).toISOString() });
  f.claims.mockResolvedValueOnce({ data: { claims: { sub: subject } }, error: null } as never)
    .mockResolvedValueOnce({ data: { claims: { sub: subject } }, error: null } as never)
    .mockImplementationOnce(async () => { vi.setSystemTime(now + 1001); return { data: { claims: { sub: subject } }, error: null } as never; });
  expect(await f.prepare(intent)).toEqual({ status: "unavailable" });
});
it("aborts the aggregate deadline and never revives late claims", async () => {
  vi.useFakeTimers(); const f = fixture(); let release!: (value: never) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.prepare(intent); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  release({ data: { claims: { sub: subject } }, error: null } as never); await vi.advanceTimersByTimeAsync(1);
  expect(f.fetcher).not.toHaveBeenCalled();
});
