import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerBlockInitialization } from "./owner-block-initialization";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const other = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const success = { status: "success", collection_revision: 1, block_id: other };
const intent = { action: "import_onboarding_connection", source_revision: 3, title: null, base_collection_revision: null };
const stateRpc = "resolve_current_owner_state";
const mutationRpc = "initialize_current_owner_blocks_from_connection";
function fixture(...values: [value?: unknown]) {
  const value = values.length ? values[0] : intent;
  const states: unknown[] = [active, active]; const calls: string[] = []; let reply: unknown = success;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://initialize.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    expect(JSON.parse(String(options!.body))).toEqual(rpc === stateRpc ? {} : { input_intent: value });
    expect([stateRpc, mutationRpc]).toContain(rpc);
    return new Response(JSON.stringify(rpc === stateRpc ? states.shift() : reply), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://initialize.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims fixture; actual pinned SDK transport, not live JWT or persistence proof.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { initialize: () => createOwnerBlockInitialization(client).initialize(value), states, calls, fetcher, claims, claim,
    setReply: (value: unknown) => { reply = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("sends exact strict intent once and acknowledges only after same subject/Owner proof", async () => {
  const f = fixture(); expect(await f.initialize()).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]); expect(f.claims).toHaveBeenCalledTimes(2);
});
it.each([null, "", " raw\t", "<Private>title", "😀".repeat(512)])("preserves recoverable explicit title %j without publication validity gate", async title => {
  const f = fixture({ ...intent, title }); expect(await f.initialize()).toEqual(success);
});
it.each([1, Number.MAX_SAFE_INTEGER])("sends safe source revision %s exactly", async source_revision => {
  const f = fixture({ ...intent, source_revision }); expect(await f.initialize()).toEqual(success);
});
it.each([null, undefined, {}, "import", { ...intent, action: "auto_import" }, { ...intent, title: undefined },
  { ...intent, title: 1 }, { ...intent, title: "\0" }, { ...intent, title: "😀".repeat(513) },
  { ...intent, base_collection_revision: 1 }, { ...intent, base_collection_revision: undefined },
  ...[0, -1, 1.5, "3", Number.MAX_SAFE_INTEGER + 1, null].map(source_revision => ({ ...intent, source_revision })),
])("rejects malformed intent %j before claims or requests", async value => {
  const f = fixture(value); expect(await f.initialize()).toEqual({ status: "invalid_import_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each(["owner_id", "block_id", "kind", "destination_url", "social_platform", "position", "is_visible", "issues", "source", "published"])("rejects caller %s before dispatch", async field => {
  const f = fixture({ ...intent, [field]: "forged" }); expect(await f.initialize()).toEqual({ status: "invalid_import_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each([null, "", "forged"])("invalid initial subject %j never dispatches mutation", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub)); expect(await f.initialize()).toEqual({ status: "unauthenticated" });
  expect(f.calls).toEqual([]);
});
it("claims error cannot trust supplied subject", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private")));
  expect(await f.initialize()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
const denials = [
  { status: "owner_missing", owner_id: null, account_state: null, onboarding_completed: null },
  { status: "onboarding_incomplete", owner_id: owner, account_state: "active", onboarding_completed: false },
  { status: "restricted", owner_id: owner, account_state: "restricted", onboarding_completed: true },
  { status: "suspended", owner_id: owner, account_state: "suspended", onboarding_completed: true },
];
it.each(denials)("initial $status returns only denial before mutation", async state => {
  const f = fixture(); f.states[0] = state; expect(await f.initialize()).toEqual({ status: state.status }); expect(f.calls).toEqual([stateRpc]);
});
it.each(denials)("post-commit $status discards acknowledgment without claiming rollback", async state => {
  const f = fixture(); f.states[1] = state; expect(await f.initialize()).toEqual({ status: "outcome_unknown" });
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});
for (const phase of [0, 1]) {
  it.each([null, {}, { ...active, owner_id: "forged" }, { ...active, onboarding_completed: false },
    { ...active, metadata: { owner_id: owner } },
    { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null },
  ])(`malformed proof ${phase} fails without leaking IDs`, async state => {
    const f = fixture(); f.states[phase] = state;
    expect(await f.initialize()).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
    expect(f.calls).toHaveLength(phase === 0 ? 1 : 3);
  });
}
it.each(["session", "subject", "binding"])("changed post-commit %s has unknown outcome, no private acknowledgment", async change => {
  const f = fixture(); if (change === "binding") f.states[1] = { ...active, owner_id: other };
  else f.claims.mockResolvedValueOnce(f.claim()).mockResolvedValueOnce(f.claim(change === "session" ? null : other));
  expect(await f.initialize()).toEqual({ status: "outcome_unknown" });
});
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_import_intent", "already_initialized", "no_source", "stale_source"])("returns strict known no-write %s without retry/default/partial data", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.initialize()).toEqual({ status });
  expect(f.calls).toEqual([stateRpc, mutationRpc]); expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each([null, {}, { ...success, collection_revision: 2 }, { ...success, block_id: "forged" }, { ...success, block_id: other.toUpperCase().replace("9000", "ABCD") },
  { ...success, owner_id: owner }, { ...success, title: "private" }, { status: "already_initialized", block_id: other }, { status: "public_ready" }])("untrusted acknowledgment %j cannot claim no write", async reply => {
  const f = fixture(); f.setReply(reply); expect(await f.initialize()).toEqual({ status: "outcome_unknown" });
  expect(f.calls).toEqual([stateRpc, mutationRpc]);
});
for (const phase of [0, 1, 2]) {
  it.each(["network", "permission"])(`request ${phase} ${"%s"} failure is bounded and never retried`, async reason => {
    const f = fixture(); const original = f.fetcher.getMockImplementation()!; let calls = 0;
    f.fetcher.mockImplementation((input, options) => {
      if (calls++ === phase) return reason === "network" ? Promise.reject(new Error("private transport"))
        : Promise.resolve(new Response('{"message":"private permission"}', { status: 403 }));
      return original(input, options);
    });
    expect(await f.initialize()).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
    expect(f.fetcher).toHaveBeenCalledTimes(phase + 1);
  });
  it(`aggregate deadline on ignored request ${phase} never revives success or starts later phase`, async () => {
    vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!; let calls = 0;
    let finish!: (value: Response) => void; let signal: AbortSignal | null | undefined;
    f.fetcher.mockImplementation((input, options) => {
      if (calls++ === phase) { signal = options?.signal; return new Promise(resolve => { finish = resolve; }); }
      return original(input, options);
    });
    const pending = f.initialize(); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" }); expect(signal?.aborted).toBe(true);
    finish(new Response(JSON.stringify(phase === 1 ? success : active))); await vi.advanceTimersByTimeAsync(0);
    expect(f.fetcher).toHaveBeenCalledTimes(phase + 1);
    expect(await pending).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
  });
}
for (const phase of [0, 1]) {
  it(`aggregate deadline during proof ${phase} claims cannot initiate later state/mutation or revive acknowledgment`, async () => {
    vi.useFakeTimers(); const f = fixture(); let finish!: (value: ReturnType<typeof f.claim>) => void;
    if (phase) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.initialize(); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: phase ? "outcome_unknown" : "unavailable" }); const count = f.fetcher.mock.calls.length;
    finish(f.claim()); await vi.advanceTimersByTimeAsync(0); expect(f.fetcher).toHaveBeenCalledTimes(count);
  });
}
it("fresh explicit invocation re-proves; transport never caches success or retries itself", async () => {
  const f = fixture(); expect(await f.initialize()).toEqual(success); f.states.push(active, active);
  expect(await f.initialize()).toEqual(success); expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc, stateRpc, mutationRpc, stateRpc]);
});
