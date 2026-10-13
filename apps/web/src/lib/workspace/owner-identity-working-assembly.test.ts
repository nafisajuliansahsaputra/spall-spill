import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerIdentityWorkingAssembly } from "./owner-identity-working-assembly";

const subject = "82000000-0000-4000-8000-000000000001";
const owner = "82000000-0000-4000-8000-000000000002";
const other = "82000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "assembly-owner", primary_use_case: "business" };
const profile = { ...context, profile_working: { display_name: "Private Owner", bio: null, profile_asset_key: null, revision: 3 } };
const composition = { ...context, profile_revision: 3, layout_working: { starter_key: "clean", revision: 2 }, connection_working: null, identity_work: "unpublished_changes" };
const assembled = { ...profile, layout_working: composition.layout_working, connection_working: null, identity_work: composition.identity_work };
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
    else if (rpc === "resolve_current_owner_profile_working") data = profile;
    else if (rpc === "resolve_current_owner_composition_working") data = composition;
    else throw new Error("Unexpected RPC");
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://assembly.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  // Controlled proof fixture, not a live JWT/provider assertion. RPC transport is actual pinned SDK.
  const claim = (...args: [sub?: unknown, error?: unknown]) => ({ data: { claims: { sub: args.length ? args[0] : subject } }, error: args[1] ?? null }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { read: createOwnerIdentityWorkingAssembly(client).read, states, contexts, overrides, calls, fetcher, claims, claim };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("assembles only minimal work after verified subject/state/context recheck using zero-target SDK requests", async () => {
  const f = fixture(); expect(await f.read()).toEqual(assembled);
  expect(f.claims).toHaveBeenCalledTimes(2); expect(f.calls).toEqual([
    "resolve_current_owner_state", "resolve_current_owner_home_context", "resolve_current_owner_profile_working",
    "resolve_current_owner_composition_working", "resolve_current_owner_state", "resolve_current_owner_home_context",
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
it.each(deniedStates)("initial $status returns only denial before Identity parts reads", async state => {
  const f = fixture(); f.states[0] = state; expect(await f.read()).toEqual({ status: state.status });
  expect(f.calls).toEqual(["resolve_current_owner_state"]);
});
it.each(deniedStates)("mid-read $status removes every private Identity parts field", async state => {
  const f = fixture(); f.states[1] = state; expect(await f.read()).toEqual({ status: state.status });
  expect(f.calls).toHaveLength(5);
});
it.each([null, {}, { ...active, onboarding_completed: false }, { ...active, owner_id: "forged" },
  { ...active, user_metadata: { owner_id: owner } },
  { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null }])("denies malformed/inconsistent state %j", async state => {
  const f = fixture(); f.states[0] = state; expect(await f.read()).toEqual({ status: "unavailable" });
  expect(f.calls).toHaveLength(1);
});
it.each(["resolve_current_owner_home_context", "resolve_current_owner_profile_working", "resolve_current_owner_composition_working"])("does not fabricate partial data when %s is unavailable", async rpc => {
  const f = fixture(); f.overrides.set(rpc, { status: "unavailable" });
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each(["current_handle", "primary_use_case"])("denies cross-reader %s drift", async key => {
  const f = fixture(); f.overrides.set("resolve_current_owner_profile_working", { ...profile, [key]: key === "current_handle" ? "other-owner" : "personal" });
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
it("drops Identity parts when session disappears after reads", async () => {
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
  expect(f.calls).toEqual([]); expect(await f.read()).toEqual(assembled);
});
it("aggregate timeout aborts state RPC and never resumes Identity parts after ignored late response", async () => {
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
it("malformed post-read state cannot retain already-read Identity parts", async () => {
  const f = fixture(); f.states[1] = { ...active, onboarding_completed: false };
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.calls).toHaveLength(5);
});

it.each([1, 4, Number.MAX_SAFE_INTEGER])("denies profile pairing revision %s without post-read proof or partial fields", async profile_revision => {
  const f = fixture(); f.overrides.set("resolve_current_owner_composition_working", { ...composition, profile_revision });
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(1); expect(f.calls).toHaveLength(4);
});
it.each(["current_handle", "primary_use_case"])("denies composition %s drift independently of profile", async key => {
  const f = fixture(); f.overrides.set("resolve_current_owner_composition_working", { ...composition, [key]: key === "current_handle" ? "other-owner" : "personal" });
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(1);
});
it("preserves optional profile/connection values without manufacturing media or modular blocks", async () => {
  const f = fixture(); const profile_working = { ...profile.profile_working, bio: "Private Bio", profile_asset_key: " opaque-key " };
  const connection_working = { connection_kind: "social", social_platform: "custom_platform-1", destination_url: "HTTPS://Private.example.test/Exact?x=1#Saved", revision: 2 };
  f.overrides.set("resolve_current_owner_profile_working", { ...profile, profile_working });
  f.overrides.set("resolve_current_owner_composition_working", { ...composition, connection_working });
  expect(await f.read()).toEqual({ ...assembled, profile_working, connection_working });
  expect(f.calls).toHaveLength(6); expect(f.fetcher).toHaveBeenCalledTimes(6);
});
it.each([
  ["resolve_current_owner_profile_working", { ...profile, owner_id: owner }],
  ["resolve_current_owner_profile_working", { ...profile, profile_working: { ...profile.profile_working, revision: 0 } }],
  ["resolve_current_owner_composition_working", { ...composition, blocks: [] }],
  ["resolve_current_owner_composition_working", { ...composition, connection_working: undefined }],
])("denies private/malformed nested data from %s", async (rpc, data) => {
  const f = fixture(); f.overrides.set(String(rpc), data); expect(await f.read()).toEqual({ status: "unavailable" });
  expect(f.claims).toHaveBeenCalledTimes(1);
});
it("aggregate timeout during ignored private response never starts post-read proof or revives assembly", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (value: Response) => void;
  f.fetcher.mockImplementation(async (input) => {
    const rpc = new URL(String(input)).pathname.split("/").at(-1)!; f.calls.push(rpc);
    if (rpc === "resolve_current_owner_profile_working") return new Promise(resolve => { finish = resolve; });
    return new Response(JSON.stringify(rpc === "resolve_current_owner_state" ? active : rpc === "resolve_current_owner_home_context" ? context : composition));
  });
  const pending = f.read(); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  finish(new Response(JSON.stringify(profile))); await vi.advanceTimersByTimeAsync(0);
  expect(f.claims).toHaveBeenCalledTimes(1); expect(f.calls).toHaveLength(4);
});
it("aggregate timeout during final context cannot return already-read private fields", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (value: Response) => void; let contextReads = 0;
  f.fetcher.mockImplementation(async (input) => {
    const rpc = new URL(String(input)).pathname.split("/").at(-1)!; f.calls.push(rpc);
    if (rpc === "resolve_current_owner_home_context" && ++contextReads === 2) return new Promise(resolve => { finish = resolve; });
    return new Response(JSON.stringify(rpc === "resolve_current_owner_state" ? active : rpc === "resolve_current_owner_home_context" ? context : rpc === "resolve_current_owner_profile_working" ? profile : composition));
  });
  const pending = f.read(); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  finish(new Response(JSON.stringify(context))); await vi.advanceTimersByTimeAsync(0);
  expect(await pending).toEqual({ status: "unavailable" }); expect(f.calls).toHaveLength(6);
});
