import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerFirstLinkInitialization } from "./owner-first-link-initialization";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const other = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const success = { status: "success", collection_revision: 1, block_id: other };
const intent = { action: "initialize_link_block", base_collection_revision: null, is_visible: false, link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } };
const stateRpc = "resolve_current_owner_state";
const mutationRpc = "initialize_current_owner_blocks_from_link";
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
  return { initialize: () => createOwnerFirstLinkInitialization(client).initialize(value), states, calls, fetcher, claims, claim,
    setReply: (value: unknown) => { reply = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("sends exact strict intent once and acknowledges only after same subject/Owner proof", async () => {
  const f = fixture(); expect(await f.initialize()).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]); expect(f.claims).toHaveBeenCalledTimes(2);
});
for (const kind of ["social", "generic_link"]) {
  for (const is_visible of [false, true]) {
    it.each([null, "", " raw\t", "<Private>title", "🙂".repeat(512)])(`preserves ${kind}/${is_visible} raw Working without publication gate`, async title => {
      const f=fixture({...intent,is_visible,link_working:{kind,title,social_platform:"unexpected provider",destination_url:"javascript:recoverable"}});
      expect(await f.initialize()).toEqual(success);
    });
  }
}
const payload = intent.link_working;
it.each([null, undefined, {}, "initialize", {...intent,action:"import_onboarding_connection"},
  {...intent,base_collection_revision:undefined}, ...[1,0,-1,Number.MAX_SAFE_INTEGER,"null",false].map(base_collection_revision=>({...intent,base_collection_revision})),
  ...[undefined,null,0,"false"].map(is_visible=>({...intent,is_visible})),
  ...[undefined,null,[],{}].map(link_working=>({...intent,link_working})),
  ...[undefined,"text","media","contact","spill_cta",null].map(kind=>({...intent,link_working:{...payload,kind}})),
  ...["title","social_platform","destination_url"].flatMap(field=>[undefined,1,false,[],{},"\0"].map(v=>({...intent,link_working:{...payload,[field]:v}}))),
  ...[["title",513],["social_platform",41],["destination_url",2049]].map(([field,n])=>({...intent,link_working:{...payload,[field as string]:"🙂".repeat(n as number)}})),
])("rejects malformed manual intent %j before claims/requests",async value=>{
  const f=fixture(value);expect(await f.initialize()).toEqual({status:"invalid_initialization_intent"});
  expect(f.claims).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it.each(["owner_id", "block_id", "kind", "destination_url", "social_platform", "position", "source_revision", "issues", "source", "published"])("rejects caller %s before dispatch", async field => {
  const f = fixture({ ...intent, [field]: "forged" }); expect(await f.initialize()).toEqual({ status: "invalid_initialization_intent" });
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
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_initialization_intent", "already_initialized"])("returns strict known no-write %s without retry/default/partial data", async status => {
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
it("unknown acknowledgment followed by explicit repeat conflicts without automatic retry or fallback",async()=>{
  const f=fixture();f.setReply({status:"success",collection_revision:1,block_id:other,private:"forged"});
  expect(await f.initialize()).toEqual({status:"outcome_unknown"});expect(f.calls).toEqual([stateRpc,mutationRpc]);
  f.states.push(active);f.setReply({status:"already_initialized"});
  expect(await f.initialize()).toEqual({status:"already_initialized"});
  expect(f.calls).toEqual([stateRpc,mutationRpc,stateRpc,mutationRpc]);
});
it.each(["owner_id","block_id","position","source_revision","provenance"])("rejects nested %s selector before authority",async field=>{
  const f=fixture({...intent,link_working:{...payload,[field]:"forged"}});
  expect(await f.initialize()).toEqual({status:"invalid_initialization_intent"});expect(f.claims).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it.each(["no_source","stale_source"])("source-only %s is not a manual acknowledgment",async status=>{
  const f=fixture();f.setReply({status});expect(await f.initialize()).toEqual({status:"outcome_unknown"});expect(f.calls).toEqual([stateRpc,mutationRpc]);
});
