import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerBlocksWorkingAssembly } from "./owner-blocks-working-assembly";

const subject = "82000000-0000-4000-8000-000000000001";
const owner = "82000000-0000-4000-8000-000000000002";
const other = "82000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "assembly-owner", primary_use_case: "business" };
const row = { block_id: other, kind: "generic_link", is_visible: false, position: 3, payload_state: "present",
  link_working: { title: " <Private> ", social_platform: null, destination_url: "javascript:private()" } };
const blocks = { ...context, collection: { revision: 3, blocks: [row] } };
const expected = { ...blocks, collection: { ...blocks.collection, blocks: [{ ...row,
  issues: [{ field: "destination_url", code: "destination_invalid" }] }] } };
const stateRpc = "resolve_current_owner_state";
const contextRpc = "resolve_current_owner_home_context";
const blocksRpc = "resolve_current_owner_blocks_working";
const sequence = [stateRpc, contextRpc, blocksRpc, stateRpc, contextRpc, blocksRpc, stateRpc];
function fixture() {
  const states: unknown[] = [active, active, active];
  const contexts: unknown[] = [context, context]; const snapshots: unknown[] = [blocks, blocks];
  const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://assembly.example.test");
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual({});
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    if (![stateRpc, contextRpc, blocksRpc].includes(rpc)) throw new Error("Unexpected RPC");
    const data = rpc === stateRpc ? states.shift() : rpc === contextRpc ? contexts.shift() : snapshots.shift();
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://assembly.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  // Controlled claims; actual pinned SDK RPC transport. No live JWT/provider claim.
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { read: createOwnerBlocksWorkingAssembly(client).read, states, contexts, snapshots, calls, fetcher, claims, claim };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("returns exact recoverable hidden link snapshot after three proofs and two independent reads", async () => {
  const f = fixture(); expect(await f.read()).toEqual(expected);
  expect(f.calls).toEqual(sequence); expect(f.claims).toHaveBeenCalledTimes(3);
});
it.each([null, { revision: 1, blocks: [] }, { revision: Number.MAX_SAFE_INTEGER, blocks: [] }])("preserves missing versus initialized collection %j", async collection => {
  const f = fixture(); f.snapshots.fill({ ...context, collection });
  expect(await f.read()).toEqual({ ...context, collection });
});
it.each(["social", "generic_link", "contact", "media", "text", "spill_cta"])("does not fabricate payload or permission for %s", async kind => {
  const f = fixture(); const item = { ...row, kind, link_working: null,
    payload_state: ["social", "generic_link"].includes(kind) ? "missing" : "not_implemented" };
  f.snapshots.fill({ ...blocks, collection: { revision: 3, blocks: [item] } });
  expect(await f.read()).toEqual({ ...blocks, collection: { revision: 3, blocks: [{ ...item, issues: [] }] } });
});
it.each([null, "", "forged"])("denies invalid initial claims %j without RPC", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub));
  expect(await f.read()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
it("claims error never trusts supplied subject", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private")));
  expect(await f.read()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
const denials = [
  { status: "owner_missing", owner_id: null, account_state: null, onboarding_completed: null },
  { status: "onboarding_incomplete", owner_id: owner, account_state: "active", onboarding_completed: false },
  { status: "restricted", owner_id: owner, account_state: "restricted", onboarding_completed: true },
  { status: "suspended", owner_id: owner, account_state: "suspended", onboarding_completed: true },
];
for (const phase of [0, 1, 2]) {
  it.each(denials)(`proof ${phase} $status retains no private fields`, async state => {
    const f = fixture(); f.states[phase] = state;
    expect(await f.read()).toEqual({ status: state.status }); expect(f.calls).toHaveLength([1, 4, 7][phase]!);
  });
  it.each([null, {}, { ...active, owner_id: "forged" }, { ...active, onboarding_completed: false },
    { ...active, user_metadata: { owner_id: owner } },
    { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null }])(`proof ${phase} malformed state %j fails closed`, async state => {
    const f = fixture(); f.states[phase] = state; expect(await f.read()).toEqual({ status: "unavailable" });
    expect(f.calls).toHaveLength([1, 4, 7][phase]!);
  });
}
for (const phase of [1, 2]) {
  it.each(["session", "subject", "binding"])(`proof ${phase} detects %s change`, async change => {
    const f = fixture(); if (change === "binding") f.states[phase] = { ...active, owner_id: other };
    else { for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
      f.claims.mockResolvedValueOnce(f.claim(change === "session" ? null : other)); }
    expect(await f.read()).toEqual({ status: change === "session" ? "unauthenticated" : "unavailable" });
    expect(f.calls).toHaveLength([0, 4, 7][phase]! - (change === "session" ? 1 : 0));
  });
}
for (const phase of [0, 1]) {
  it.each(["context", "blocks"])(`read ${phase} unavailable %s cannot return partial data`, async reader => {
    const f = fixture(); (reader === "context" ? f.contexts : f.snapshots)[phase] = { status: "unavailable" };
    expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(phase + 1);
  });
  it.each(["current_handle", "primary_use_case"])(`read ${phase} detects context %s drift`, async key => {
    const f = fixture(); f.contexts[phase] = { ...context, [key]: key === "current_handle" ? "other-owner" : "personal" };
    expect(await f.read()).toEqual({ status: "unavailable" });
  });
  it.each(["current_handle", "primary_use_case"])(`read ${phase} detects block context %s drift`, async key => {
    const f = fixture(); f.snapshots[phase] = { ...blocks, [key]: key === "current_handle" ? "other-owner" : "personal" };
    expect(await f.read()).toEqual({ status: "unavailable" });
  });
}
it.each([null, { revision: 4, blocks: [row] }, { revision: 3, blocks: [] },
  { revision: 3, blocks: [{ ...row, is_visible: true }] },
  { revision: 3, blocks: [{ ...row, position: 4 }] },
  { revision: 3, blocks: [{ ...row, link_working: { ...row.link_working, title: "changed" } }] },
])("rejects changed presence/revision/content even without bump %j", async collection => {
  const f = fixture(); f.snapshots[1] = { ...context, collection }; expect(await f.read()).toEqual({ status: "unavailable" });
  expect(f.claims).toHaveBeenCalledTimes(2);
});
it("rejects initialization during read without manufacturing empty data", async () => {
  const f = fixture(); f.snapshots[0] = { ...context, collection: null };
  f.snapshots[1] = { ...context, collection: { revision: 1, blocks: [] } };
  expect(await f.read()).toEqual({ status: "unavailable" });
});
it.each([0, 1])("rejects forged private/Published fields on read %s", async phase => {
  const f = fixture(); f.snapshots[phase] = { ...blocks, owner_id: owner, identity_work: "unchanged" };
  expect(await f.read()).toEqual({ status: "unavailable" });
});
it.each(["network", "permission"])("does not retry or expose %s failure", async reason => {
  const f = fixture(); if (reason === "network") f.fetcher.mockRejectedValueOnce(new Error("private"));
  else f.fetcher.mockResolvedValueOnce(new Response('{"message":"private"}', { status: 403 }));
  expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.fetcher).toHaveBeenCalledTimes(1);
});
for (const phase of [0, 1, 2]) {
  it(`aggregate deadline stops ignored late claims at proof ${phase}`, async () => {
    vi.useFakeTimers(); const f = fixture(); let finish!: (value: ReturnType<typeof f.claim>) => void;
    for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.read(); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: "unavailable" }); const count = f.calls.length;
    finish(f.claim()); await vi.advanceTimersByTimeAsync(0); expect(f.calls).toHaveLength(count);
  });
}
it.each(sequence.map((rpc, index) => ({ rpc, index })))("aggregate deadline rejects ignored late $rpc at request $index", async ({ index }) => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  let request = 0; let finish!: (value: Response) => void; let signal: AbortSignal | null | undefined;
  f.fetcher.mockImplementation((input, options) => {
    if (request++ === index) { signal = options?.signal; return new Promise(resolve => { finish = resolve; }); }
    return original(input, options);
  });
  const pending = f.read(); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: "unavailable" }); const count = f.fetcher.mock.calls.length;
  if ([0, 3, 6].includes(index)) expect(signal?.aborted).toBe(true);
  finish(new Response(JSON.stringify(sequence[index] === stateRpc ? active : sequence[index] === contextRpc ? context : blocks)));
  await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  expect(f.fetcher).toHaveBeenCalledTimes(count);
});
it("fresh invocation re-proves and re-reads without caching", async () => {
  const f = fixture(); expect(await f.read()).toEqual(expected);
  f.states.push(active, active, active); f.contexts.push(context, context); f.snapshots.push(blocks, blocks);
  expect(await f.read()).toEqual(expected); expect(f.calls).toEqual([...sequence, ...sequence]);
});
