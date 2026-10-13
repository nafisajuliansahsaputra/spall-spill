import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerBlockLinkWorkingSave } from "./owner-block-link-working-save";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const other = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const success = { status: "success", collection_revision: 2, block_id: other };
const link = { kind: "generic_link", title: null, social_platform: null, destination_url: null };
const intent = { block_id: other, base_collection_revision: 1, link_working: link };
const stateRpc = "resolve_current_owner_state";
const mutationRpc = "save_current_owner_block_link_working";
function fixture(...values: [value?: unknown]) {
  const value = values.length ? values[0] : intent;
  const states: unknown[] = [active, active]; const calls: string[] = []; let reply: unknown = success;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://initialize.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    expect(JSON.parse(String(options!.body))).toEqual(rpc === stateRpc ? {} : { input_working: value });
    expect([stateRpc, mutationRpc]).toContain(rpc);
    return new Response(JSON.stringify(rpc === stateRpc ? states.shift() : reply), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://initialize.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims fixture; actual pinned SDK transport, not live JWT or persistence proof.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { save: () => createOwnerBlockLinkWorkingSave(client).save(value), states, calls, fetcher, claims, claim,
    setReply: (value: unknown) => { reply = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("sends exact strict intent once and acknowledges only after same subject/Owner proof", async () => {
  const f = fixture(); expect(await f.save()).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]); expect(f.claims).toHaveBeenCalledTimes(2);
});
it.each([null, "", " raw\t", "<Private>title", "😀".repeat(512)])("preserves recoverable explicit title %j without publication validity gate", async title => {
  const f = fixture({ ...intent, link_working: { ...link, title } }); expect(await f.save()).toEqual(success);
});
it.each([1, Number.MAX_SAFE_INTEGER - 1])("sends safe base revision %s and requires its exact next acknowledgment", async base_collection_revision => {
  const f = fixture({ ...intent, base_collection_revision });
  const reply = { ...success, collection_revision: base_collection_revision + 1 }; f.setReply(reply);
  expect(await f.save()).toEqual(reply);
});
it("maximum safe base permits only truthful exhausted denial, no unsafe acknowledgment", async () => {
  const f = fixture({ ...intent, base_collection_revision: Number.MAX_SAFE_INTEGER });
  f.setReply({ status: "revision_exhausted" }); expect(await f.save()).toEqual({ status: "revision_exhausted" });
});
it.each([null, undefined, {}, "save", { ...intent, block_id: "forged" },
  { ...intent, link_working: null }, { ...intent, link_working: [] },
  { ...intent, link_working: { ...link, title: undefined } }, { ...intent, link_working: { ...link, title: 1 } },
  { ...intent, link_working: { ...link, title: "\0" } }, { ...intent, link_working: { ...link, title: "😀".repeat(513) } },
  { ...intent, link_working: { ...link, social_platform: "x".repeat(41) } },
  { ...intent, link_working: { ...link, destination_url: "😀".repeat(2049) } },
  { ...intent, link_working: { ...link, kind: "contact" } },
  { ...intent, link_working: { ...link, issues: [] } }, { ...intent, link_working: { ...link, owner_id: owner } },
  ...[0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1, null, undefined].map(base_collection_revision => ({ ...intent, base_collection_revision })),
])("rejects malformed intent %j before claims or requests", async value => {
  const f = fixture(value); expect(await f.save()).toEqual({ status: "invalid_link_working" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each(["owner_id", "kind", "destination_url", "social_platform", "position", "is_visible", "issues", "source", "published"])("rejects caller %s before dispatch", async field => {
  const f = fixture({ ...intent, [field]: "forged" }); expect(await f.save()).toEqual({ status: "invalid_link_working" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each([null, "", "forged"])("invalid initial subject %j never dispatches mutation", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub)); expect(await f.save()).toEqual({ status: "unauthenticated" });
  expect(f.calls).toEqual([]);
});
it("claims error cannot trust supplied subject", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private")));
  expect(await f.save()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
const denials = [
  { status: "owner_missing", owner_id: null, account_state: null, onboarding_completed: null },
  { status: "onboarding_incomplete", owner_id: owner, account_state: "active", onboarding_completed: false },
  { status: "restricted", owner_id: owner, account_state: "restricted", onboarding_completed: true },
  { status: "suspended", owner_id: owner, account_state: "suspended", onboarding_completed: true },
];
it.each(denials)("initial $status returns only denial before mutation", async state => {
  const f = fixture(); f.states[0] = state; expect(await f.save()).toEqual({ status: state.status }); expect(f.calls).toEqual([stateRpc]);
});
it.each(denials)("post-commit $status discards acknowledgment without claiming rollback", async state => {
  const f = fixture(); f.states[1] = state; expect(await f.save()).toEqual({ status: "outcome_unknown" });
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});
for (const phase of [0, 1]) {
  it.each([null, {}, { ...active, owner_id: "forged" }, { ...active, onboarding_completed: false },
    { ...active, metadata: { owner_id: owner } },
    { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null },
  ])(`malformed proof ${phase} fails without leaking IDs`, async state => {
    const f = fixture(); f.states[phase] = state;
    expect(await f.save()).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
    expect(f.calls).toHaveLength(phase === 0 ? 1 : 3);
  });
}
it.each(["session", "subject", "binding"])("changed post-commit %s has unknown outcome, no private acknowledgment", async change => {
  const f = fixture(); if (change === "binding") f.states[1] = { ...active, owner_id: other };
  else f.claims.mockResolvedValueOnce(f.claim()).mockResolvedValueOnce(f.claim(change === "session" ? null : other));
  expect(await f.save()).toEqual({ status: "outcome_unknown" });
});
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_link_working", "stale_write", "revision_exhausted", "block_not_found", "unsupported_block_kind"])("returns strict known no-write %s without retry/default/partial data", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.save()).toEqual({ status });
  expect(f.calls).toEqual([stateRpc, mutationRpc]); expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each([null, {}, { ...success, collection_revision: 1 }, { ...success, collection_revision: 3 }, { ...success, collection_revision: Number.MAX_SAFE_INTEGER + 1 }, { ...success, block_id: subject }, { ...success, block_id: "forged" }, { ...success, block_id: other.toUpperCase().replace("9000", "ABCD") },
  { ...success, owner_id: owner }, { ...success, title: "private" }, { status: "stale_write", block_id: other }, { status: "public_ready" }])("untrusted acknowledgment %j cannot claim no write", async reply => {
  const f = fixture(); f.setReply(reply); expect(await f.save()).toEqual({ status: "outcome_unknown" });
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
    expect(await f.save()).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
    expect(f.fetcher).toHaveBeenCalledTimes(phase + 1);
  });
  it(`aggregate deadline on ignored request ${phase} never revives success or starts later phase`, async () => {
    vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!; let calls = 0;
    let finish!: (value: Response) => void; let signal: AbortSignal | null | undefined;
    f.fetcher.mockImplementation((input, options) => {
      if (calls++ === phase) { signal = options?.signal; return new Promise(resolve => { finish = resolve; }); }
      return original(input, options);
    });
    const pending = f.save(); await vi.advanceTimersByTimeAsync(5000);
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
    const pending = f.save(); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: phase ? "outcome_unknown" : "unavailable" }); const count = f.fetcher.mock.calls.length;
    finish(f.claim()); await vi.advanceTimersByTimeAsync(0); expect(f.fetcher).toHaveBeenCalledTimes(count);
  });
}
it("fresh explicit invocation re-proves and respects backend stale denial, never caching success or auto-retrying", async () => {
  const f = fixture(); expect(await f.save()).toEqual(success); f.states.push(active); f.setReply({ status: "stale_write" });
  expect(await f.save()).toEqual({ status: "stale_write" }); expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc, stateRpc, mutationRpc]);
});

it.each(["social", "generic_link"])("retains exact invalid raw %s Working without diagnostics/public gate or rewrite", async kind => {
  const value = { ...intent, link_working: { kind, title: " <Private>\t", social_platform: "NotNormalized", destination_url: "javascript:private()" } };
  const original = structuredClone(value); const f = fixture(value); expect(await f.save()).toEqual(success);
  expect(value).toEqual(original);
});
it("preserves code-point transport boundaries and nulls", async () => {
  const f = fixture({ ...intent, link_working: { kind: "social", title: "😀".repeat(512), social_platform: "x".repeat(40), destination_url: "😀".repeat(2048) } });
  expect(await f.save()).toEqual(success);
});
