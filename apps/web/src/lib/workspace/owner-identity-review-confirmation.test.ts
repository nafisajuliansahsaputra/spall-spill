import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerIdentityReviewConfirmation } from "./owner-identity-review-confirmation";
const subject = "25200000-0000-4000-8000-000000000001";
const owner = "25200000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const intent = { action: "confirm_identity_working_review", snapshot_hash: "a".repeat(64) };
const success = { status: "success", receipt_id: "25200000-0000-4000-8000-000000000021", snapshot_hash: intent.snapshot_hash, expires_at: "2099-01-01T00:00:00Z" };
function fixture(...values: unknown[]) {
  const value = values.length ? values[0] : intent; const expected = structuredClone(value);
  const states: unknown[] = [active, active]; const calls: string[] = []; let reply: unknown = success;
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const rpc = String(url).split("/").at(-1)!; calls.push(rpc);
    expect(new URL(String(url)).origin).toBe("https://layout.example.test");
    expect(options!.method).toBe("POST"); expect(options!.signal).toBeDefined();
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(JSON.parse(String(options!.body))).toEqual(rpc === "resolve_current_owner_state" ? {} : { input_review: expected });
    return Response.json(rpc === "resolve_current_owner_state" ? states.shift() : reply);
  });
  const client = createClient("https://layout.example.test", "test-placeholder", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub = subject) => ({ data: { claims: { sub } }, error: null }) as never;
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { confirm: () => createOwnerIdentityReviewConfirmation(client).confirm(value), states, calls, fetcher, claims, claim, setReply: (v: unknown) => { reply = v; } };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("sends one explicit confirmation and requires same-actor active Owner proof around exact hash ack", async () => {
  const f = fixture(); expect(await f.confirm()).toEqual(success); expect(f.claims).toHaveBeenCalledTimes(2);
  expect(f.calls).toEqual(["resolve_current_owner_state", "confirm_current_owner_identity_working_review", "resolve_current_owner_state"]);
});
it.each([null, undefined, {}, [], "confirm", { ...intent, action: "publish" },
  ...[null, 1, true, "", "a".repeat(63), "a".repeat(65), "A".repeat(64), "a".repeat(64) + "\n"].map(snapshot_hash => ({ ...intent, snapshot_hash })),
  ...["owner_id", "receipt_id", "expires_at", "snapshot", "ready", "base_revision"].map(field => ({ ...intent, [field]: "forged" })),
])("strict confirmation rejects forged/malformed input before I/O %#", async value => {
  const f = fixture(value); expect(await f.confirm()).toEqual({ status: "invalid_review" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each(["restricted", "suspended", "onboarding_incomplete", "owner_missing"])("initial %s never dispatches confirmation", async status => {
  const f = fixture(); f.states[0] = status === "owner_missing" ? { status, owner_id: null, account_state: null, onboarding_completed: null }
    : { ...active, status, account_state: status === "onboarding_incomplete" ? "active" : status, onboarding_completed: status !== "onboarding_incomplete" };
  expect(await f.confirm()).toEqual({ status }); expect(f.calls).toHaveLength(1);
});
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "invalid_review", "stale_review", "unavailable"])("preserves explicit negative %s without retry", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.confirm()).toEqual({ status }); expect(f.calls).toHaveLength(2);
});
it.each([null, {}, { ...success, owner_id: owner }, { ...success, snapshot_hash: "b".repeat(64) },
  { ...success, receipt_id: "forged" }, { ...success, expires_at: "2000-01-01T00:00:00Z" },
  { ...success, expires_at: null }, { ...success, ready: true }, { ...success, status: "published" },
])("untrusted/lost or wrong-bound acknowledgment %# becomes outcome_unknown", async reply => {
  const f = fixture(); f.setReply(reply); expect(await f.confirm()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toHaveLength(2);
});
it.each(["actor", "owner", "restriction"])("postdispatch %s change cannot retain receipt", async field => {
  const f = fixture();
  if (field === "actor") f.claims.mockResolvedValueOnce(f.claim()).mockResolvedValueOnce(f.claim(owner));
  else f.states[1] = field === "owner" ? { ...active, owner_id: subject } : { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.confirm()).toEqual({ status: "outcome_unknown" });
});
it("unauthenticated claims never reach RPC", async () => {
  const f = fixture(); f.claims.mockResolvedValue({ data: null, error: new Error("private detail") } as never);
  expect(await f.confirm()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
it.each([false, true])("transport failure after dispatch=%s does not retry or expose detail", async dispatched => {
  const f = fixture(); const base = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => String(url).endsWith(dispatched ? "confirm_current_owner_identity_working_review" : "resolve_current_owner_state")
    ? Promise.reject(new Error("private detail")) : base(url, options));
  expect(await f.confirm()).toEqual({ status: dispatched ? "outcome_unknown" : "unavailable" });
});
it.each([false, true])("deadline after dispatch=%s aborts and ignores late replies", async dispatched => {
  vi.useFakeTimers(); const f = fixture(); let signal: AbortSignal | null | undefined;
  const base = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => String(url).endsWith(dispatched ? "confirm_current_owner_identity_working_review" : "resolve_current_owner_state")
    ? new Promise(() => { signal = options?.signal; }) : base(url, options));
  const pending = f.confirm(); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: dispatched ? "outcome_unknown" : "unavailable" }); expect(signal?.aborted).toBe(true);
});
it("copies explicit hash before asynchronous proof", async () => {
  const value = { ...intent }; const f = fixture(value); const pending = f.confirm(); value.snapshot_hash = "b".repeat(64);
  expect(await pending).toEqual(success);
});
it("cannot return an acknowledgment that expires during final proof", async () => {
  vi.useFakeTimers(); const f = fixture(); f.setReply({ ...success, expires_at: new Date(Date.now() + 2000).toISOString() });
  let release!: (value: never) => void;
  f.claims.mockResolvedValueOnce(f.claim()).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.confirm(); await vi.advanceTimersByTimeAsync(3000); release(f.claim());
  expect(await pending).toEqual({ status: "outcome_unknown" });
});
