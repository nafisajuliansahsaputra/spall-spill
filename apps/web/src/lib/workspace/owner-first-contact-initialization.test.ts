import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerFirstContactInitialization } from "./owner-first-contact-initialization";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const other = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const success = { status: "success", collection_revision: 1, block_id: other };
const intent = { action: "initialize_contact_block", base_collection_revision: null, is_visible: false, contact_working: { kind: "contact", contact_type: "email", label: null as string | null, value: null as string | null } };
const stateRpc = "resolve_current_owner_state";
const mutationRpc = "initialize_current_owner_blocks_from_contact";
function fixture(...values: [value?: unknown]) {
  const value = values.length ? values[0] : structuredClone(intent);
  const original = structuredClone(value);
  const states: unknown[] = [active, active]; const calls: string[] = []; let reply: unknown = success;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://initialize.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    expect(JSON.parse(String(options!.body))).toEqual(rpc === stateRpc ? {} : { input_intent: original });
    expect([stateRpc, mutationRpc]).toContain(rpc);
    return new Response(JSON.stringify(rpc === stateRpc ? states.shift() : reply), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://initialize.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims fixture; actual pinned SDK transport, not live JWT or persistence proof.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  const initializer = createOwnerFirstContactInitialization(client);
  return { initialize: () => initializer.initialize(value), states, calls, fetcher, claims, claim,
    setReply: (value: unknown) => { reply = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("sends exact strict intent once and acknowledges only after same subject/Owner proof", async () => {
  const f = fixture(); expect(await f.initialize()).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]); expect(f.claims).toHaveBeenCalledTimes(2);
});
const contact = intent.contact_working;
for (const contact_type of [null, "email", "whatsapp", "phone"]) {
  it.each([null, "", " ", "\t\r\n", "  e\u0301 and é 🙂  ", "First\r\nSecond\tline\nLast\r",
    '<script>globalThis.privateContactExecuted = true</script>', "**literal** [label](javascript:private)",
    "https://127.0.0.1/private", "Keep\u0001private", "🙂".repeat(2048),
  ])(`preserves recoverable raw Contact ${contact_type} %s and explicit visibility`, async value => {
    for (const is_visible of [true, false]) {
      const input = Object.freeze({ ...intent, is_visible,
        contact_working: Object.freeze({ kind: "contact", contact_type, label: " Raw\r\nlabel 🙂 ", value }) });
      const original = structuredClone(input); const f = fixture(input);
      expect(await f.initialize()).toEqual(success); expect(input).toEqual(original);
      expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
      expect(Object.hasOwn(globalThis, "privateContactExecuted")).toBe(false);
    }
  });
}
const payload = intent.contact_working;
it.each([null, undefined, {}, [], "initialize", ...["import_onboarding_connection", "add_contact_block", "initialize_link_block", "initialize_text_block", undefined].map(action => ({ ...intent, action })),
  { ...intent, base_collection_revision: undefined }, ...[1, 0, -1, 0.5, Number.MAX_SAFE_INTEGER, "null", false].map(base_collection_revision => ({ ...intent, base_collection_revision })),
  ...[undefined, null, 0, "false"].map(is_visible => ({ ...intent, is_visible })),
  ...[undefined, null, [], {}].map(contact_working => ({ ...intent, contact_working })),
  ...[undefined, "social", "generic_link", "media", "text", "spill_cta", null].map(kind => ({ ...intent, contact_working: { ...payload, kind } })),
  ...[undefined, 1, false, [], {}, "\0", "🙂".repeat(2049)].map(value => ({ ...intent, contact_working: { ...payload, value } })),
])("rejects malformed explicit Contact intent %# before claims/requests", async value => {
  const f = fixture(value); expect(await f.initialize()).toEqual({ status: "invalid_initialization_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each(["owner_id", "block_id", "kind", "destination_url", "social_platform", "position", "source_revision", "issues", "source", "provenance", "published", "next_revision", "operation_id", "confirm_removal"])("rejects caller %s before dispatch", async field => {
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
it.each([null, {}, { ...success, collection_revision: undefined }, { ...success, collection_revision: 0 }, { ...success, collection_revision: "1" }, { ...success, collection_revision: Number.MAX_SAFE_INTEGER + 1 }, { ...success, contact_working: payload }, { ...success, is_visible: true }, { ...success, block_id: undefined }, { ...success, block_id: null }, { status: "outcome_unknown" }, { ...success, collection_revision: 2 }, { ...success, block_id: "forged" }, { ...success, block_id: other.toUpperCase().replace("9000", "ABCD") },
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
it.each(["owner_id","block_id","position","source_revision","provenance","html","format","safe","destination_url","issues","published"])("rejects nested %s selector before authority",async field=>{
  const f=fixture({...intent,contact_working:{...payload,[field]:"forged"}});
  expect(await f.initialize()).toEqual({status:"invalid_initialization_intent"});expect(f.claims).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it.each(["no_source","stale_source","stale_write","revision_exhausted","block_not_found","unsupported_block_kind","position_exhausted"])("source-only %s is not a manual acknowledgment",async status=>{
  const f=fixture();f.setReply({status});expect(await f.initialize()).toEqual({status:"outcome_unknown"});expect(f.calls).toEqual([stateRpc,mutationRpc]);
});

it("copies whole raw Contact intent before slow claims without sharing caller mutations", async () => {
  const value = { ...intent, contact_working: { ...contact, label: " Original ", value: "  original\r\n🙂  " } };
  const f = fixture(value); let finish!: (value: ReturnType<typeof f.claim>) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.initialize();
  value.contact_working.value = "Changed"; value.contact_working.label = "Changed";
  value.contact_working.contact_type = "phone"; value.is_visible = true; value.action = "add_contact_block";
  finish(f.claim()); expect(await pending).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});
it.each([0, 1])("claims exception in phase %s preserves dispatch outcome truth", async phase => {
  const f = fixture(); if (phase) f.claims.mockResolvedValueOnce(f.claim());
  f.claims.mockRejectedValueOnce(new Error("private claims failure"));
  expect(await f.initialize()).toEqual({ status: phase ? "outcome_unknown" : "unavailable" });
  expect(f.calls).toEqual(phase ? [stateRpc, mutationRpc] : []);
});
it("slow claims consume one aggregate budget without restarting mutation deadline", async () => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  f.claims.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(f.claim()), 3000)));
  let finish!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(original).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const settled = vi.fn(); const pending = f.initialize().then(value => { settled(); return value; });
  await vi.advanceTimersByTimeAsync(3000); expect(f.fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999); expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(await pending).toEqual({ status: "outcome_unknown" });
  finish(new Response(JSON.stringify(success))); await vi.advanceTimersByTimeAsync(0);
  expect(f.fetcher).toHaveBeenCalledTimes(2); expect(f.claims).toHaveBeenCalledTimes(1);
});
it("same initializer instance re-proves and never caches previous success", async () => {
  const f = fixture(); expect(await f.initialize()).toEqual(success);
  f.states.push(active); f.setReply({ status: "already_initialized" });
  expect(await f.initialize()).toEqual({ status: "already_initialized" });
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc, stateRpc, mutationRpc]);
});
it.each([null, "", "🙂".repeat(512), " Raw\r\n\tlabel\u007f "])("preserves nullable/raw/full-bound label %s without local-issue rejection", async label => {
  const f = fixture({ ...intent, contact_working: { ...contact, contact_type: null, label, value: null } });
  expect(await f.initialize()).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});
for (const field of ["kind", "contact_type", "label", "value"]) {
  it(`missing Contact ${field} never defaults or dispatches`, async () => {
    const payload: Record<string, unknown> = { ...contact }; delete payload[field];
    const f = fixture({ ...intent, contact_working: payload });
    expect(await f.initialize()).toEqual({ status: "invalid_initialization_intent" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
}
for (const field of ["contact_type", "label", "value"]) {
  it.each([true, 42, [], {}])(`wrong Contact ${field} type %j never coerces before auth`, async value => {
    const f = fixture({ ...intent, contact_working: { ...contact, [field]: value } });
    expect(await f.initialize()).toEqual({ status: "invalid_initialization_intent" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
}
it.each([
  { ...contact, contact_type: "Email" }, { ...contact, contact_type: "tel" },
  { ...contact, contact_type: "phone " }, { ...contact, label: "🙂".repeat(513) },
  { ...contact, label: "private\u0000" }, { ...contact, href: "mailto:private" },
  { ...contact, safe: true }, { ...contact, country: "ID" }, { ...contact, issues: [] },
  { ...contact, text: "wrong payload" }, { ...contact, owner_id: owner },
])("rejects unsupported or extra Contact payload %j before I/O", async contact_working => {
  const f = fixture({ ...intent, contact_working });
  expect(await f.initialize()).toEqual({ status: "invalid_initialization_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each([
  { action: "add_text_block", base_collection_revision: 1, is_visible: false, text_working: { kind: "text", text: null } },
  { action: "add_link_block", base_collection_revision: 1, is_visible: true,
    link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } },
])("does not convert other allocation intents %j", async value => {
  const f = fixture(value); expect(await f.initialize()).toEqual({ status: "invalid_initialization_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it("never creates a client UUID or resolves a target before returning backend acknowledgment", async () => {
  const id = vi.spyOn(crypto, "randomUUID"); const f = fixture();
  expect(await f.initialize()).toEqual(success); expect(id).not.toHaveBeenCalled();
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});
it.each([false, 0, null, 2, -1, 1.5, Number.MAX_SAFE_INTEGER, "1"])("only exact numeric creation revision1 can acknowledge %j", async collection_revision => {
  const f = fixture(); f.setReply({ ...success, collection_revision });
  expect(await f.initialize()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([stateRpc, mutationRpc]);
});
it("lost initialization acknowledgment then explicit conflict does not infer prior success or retry", async () => {
  const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementationOnce(original).mockRejectedValueOnce(new Error("lost initialization acknowledgment"));
  expect(await f.initialize()).toEqual({ status: "outcome_unknown" }); expect(f.fetcher).toHaveBeenCalledTimes(2);
  f.states.push(active); f.setReply({ status: "already_initialized" });
  expect(await f.initialize()).toEqual({ status: "already_initialized" }); expect(f.fetcher).toHaveBeenCalledTimes(4);
});
