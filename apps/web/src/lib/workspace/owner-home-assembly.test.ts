import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerHomeAssembly } from "./owner-home-assembly";

const subject = "78000000-0000-4000-8000-000000000001";
const owner = "78000000-0000-4000-8000-000000000002";
const other = "78000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "assembly-owner", primary_use_case: "business" };
const drafts = { ...context, product_drafts: 1, resource_drafts: 0 };
const identity = { ...context, identity_work: "unpublished_changes" };
function fixture() {
  const states: unknown[] = [active, active]; const contexts: unknown[] = [context, context];
  const overrides = new Map<string, unknown>(); const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://assembly.example.test");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({});
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    let data: unknown;
    if (overrides.has(rpc)) data = overrides.get(rpc);
    else if (rpc === "resolve_current_owner_state") data = states.shift();
    else if (rpc === "resolve_current_owner_home_context") data = contexts.shift();
    else if (rpc === "resolve_current_owner_home_drafts") data = drafts;
    else if (rpc === "resolve_current_owner_home_identity_work") data = identity;
    else throw new Error("Unexpected RPC");
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://assembly.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  // Controlled proof fixture, not a live JWT/provider assertion. RPC transport is actual pinned SDK.
  const claim = (...args: [sub?: unknown, error?: unknown]) => ({ data: { claims: { sub: args.length ? args[0] : subject } }, error: args[1] ?? null }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { read: createOwnerHomeAssembly(client).read, states, contexts, overrides, calls, fetcher, claims, claim };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("assembles only minimal work after verified subject/state/context recheck using zero-target SDK requests", async () => {
  const f = fixture(); expect(await f.read()).toEqual({ ...drafts, identity_work: identity.identity_work });
  expect(f.claims).toHaveBeenCalledTimes(2); expect(f.calls).toEqual([
    "resolve_current_owner_state", "resolve_current_owner_home_context", "resolve_current_owner_home_drafts",
    "resolve_current_owner_home_identity_work", "resolve_current_owner_state", "resolve_current_owner_home_context",
  ]);
});
it.each([null, undefined, "forged", ""])("denies missing/invalid verified subject %j before private reads", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub));
  expect(await f.read()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
it("denies claims error despite supplied subject without trusting metadata", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private claims failure")));
  expect(await f.read()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
const deniedStates = [
  { status: "owner_missing", owner_id: null, account_state: null, onboarding_completed: null },
  { status: "onboarding_incomplete", owner_id: owner, account_state: "active", onboarding_completed: false },
  { status: "restricted", owner_id: owner, account_state: "restricted", onboarding_completed: true },
  { status: "suspended", owner_id: owner, account_state: "suspended", onboarding_completed: true },
];
it.each(deniedStates)("initial $status returns only denial before Home reads", async state => {
  const f = fixture(); f.states[0] = state; expect(await f.read()).toEqual({ status: state.status });
  expect(f.calls).toEqual(["resolve_current_owner_state"]);
});
it.each(deniedStates)("mid-read $status removes every private Home field", async state => {
  const f = fixture(); f.states[1] = state; expect(await f.read()).toEqual({ status: state.status });
  expect(f.calls).toHaveLength(5);
});
it.each([null, {}, { ...active, onboarding_completed: false }, { ...active, owner_id: "forged" },
  { ...active, user_metadata: { owner_id: owner } },
  { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null }])("denies malformed/inconsistent state %j", async state => {
  const f = fixture(); f.states[0] = state; expect(await f.read()).toEqual({ status: "unavailable" });
  expect(f.calls).toHaveLength(1);
});
it.each(["resolve_current_owner_home_context", "resolve_current_owner_home_drafts", "resolve_current_owner_home_identity_work"])("does not fabricate partial data when %s is unavailable", async rpc => {
  const f = fixture(); f.overrides.set(rpc, { status: "unavailable" });
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each(["current_handle", "primary_use_case"])("denies cross-reader %s drift", async key => {
  const f = fixture(); f.overrides.set("resolve_current_owner_home_drafts", { ...drafts, [key]: key === "current_handle" ? "other-owner" : "personal" });
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each(["current_handle", "primary_use_case"])("denies post-read context %s drift", async key => {
  const f = fixture(); f.contexts[1] = { ...context, [key]: key === "current_handle" ? "renamed-owner" : "personal" };
  expect(await f.read()).toEqual({ status: "unavailable" });
});
it("denies changed authenticated subject even when context matches", async () => {
  const f = fixture(); f.claims.mockResolvedValueOnce(f.claim()).mockResolvedValueOnce(f.claim(other));
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.calls).toHaveLength(5);
});
it("denies changed Owner binding even when subject/context match", async () => {
  const f = fixture(); f.states[1] = { ...active, owner_id: other };
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.calls).toHaveLength(5);
});
it("drops Home when session disappears after reads", async () => {
  const f = fixture(); f.claims.mockResolvedValueOnce(f.claim()).mockResolvedValueOnce(f.claim(null));
  expect(await f.read()).toEqual({ status: "unauthenticated" }); expect(f.calls).toHaveLength(4);
});
it.each(["network", "permission"])("does not retry or leak %s state failure", async reason => {
  const f = fixture(); if (reason === "network") f.fetcher.mockRejectedValueOnce(new Error("private error"));
  else f.fetcher.mockResolvedValueOnce(new Response('{"message":"private error"}', { status: 403 }));
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it("aggregate timeout rejects ignored late claims and stops all subsequent phases without caching", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (value: ReturnType<typeof f.claim>) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.read(); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: "unavailable" }); finish(f.claim()); await vi.advanceTimersByTimeAsync(0);
  expect(f.calls).toEqual([]); expect(await f.read()).toEqual({ ...drafts, identity_work: identity.identity_work });
});
it("aggregate timeout aborts state RPC and never resumes Home after ignored late response", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (value: Response) => void;
  f.fetcher.mockImplementationOnce((_input, options) => { expect(options!.signal).toBeDefined(); return new Promise(resolve => { finish = resolve; }); });
  const pending = f.read(); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: "unavailable" }); expect(f.fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  finish(new Response(JSON.stringify(active))); await vi.advanceTimersByTimeAsync(0);
  expect(f.fetcher).toHaveBeenCalledTimes(1); expect(f.calls).toEqual([]);
});

it("aggregate timeout during post-read claims cannot initiate fresh context or revive output", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (value: ReturnType<typeof f.claim>) => void;
  f.claims.mockResolvedValueOnce(f.claim()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.read(); await vi.advanceTimersByTimeAsync(0); expect(f.calls).toHaveLength(4);
  await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  finish(f.claim()); await vi.advanceTimersByTimeAsync(0); expect(f.calls).toHaveLength(4);
});
it("malformed post-read state cannot retain already-read Home", async () => {
  const f = fixture(); f.states[1] = { ...active, onboarding_completed: false };
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.calls).toHaveLength(5);
});
