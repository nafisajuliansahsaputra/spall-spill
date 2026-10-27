import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerMediaBlockAllocation } from "./owner-media-block-allocation";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const other = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const success = { status: "success", collection_revision: 2, block_id: other };
const asset = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const media = { kind: "media", asset_key: asset, alt_text: "Raw private Media" };
const intent = { action: "add_media_block", base_collection_revision: 1, is_visible: false, media_working: media };
const stateRpc = "resolve_current_owner_state";
const mutationRpc = "add_current_owner_media_block_working";
function fixture(...values: [value?: unknown]) {
  const value = values.length ? values[0] : intent;
  const expected = structuredClone(value);
  const states: unknown[] = [active, active]; const calls: string[] = []; let reply: unknown = success;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://initialize.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    expect(JSON.parse(String(options!.body))).toEqual(rpc === stateRpc ? {} : { input_intent: expected });
    expect([stateRpc, mutationRpc]).toContain(rpc);
    return new Response(JSON.stringify(rpc === stateRpc ? states.shift() : reply), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://initialize.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims fixture; actual pinned SDK transport, not live JWT or persistence proof.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  const allocation = createOwnerMediaBlockAllocation(client);
  return { add: () => allocation.add(value), states, calls, fetcher, claims, claim,
    setReply: (value: unknown) => { reply = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("sends exact strict intent once and acknowledges only after same subject/Owner proof", async () => {
  const f = fixture(); expect(await f.add()).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]); expect(f.claims).toHaveBeenCalledTimes(2);
});
for (const asset_key of [null, asset]) {
  it.each([null, "", " ", "\t\r\n", "  e\u0301 and é 🙂  ", "First\r\nSecond\tline\nLast\r",
    '<script>globalThis.privateMediaExecuted = true</script>', "**literal** [label](javascript:private)",
    "https://127.0.0.1/private", "Keep\u0001private", "🙂".repeat(2048),
  ])(`preserves recoverable raw Media ${asset_key} %s without public-validity rejection`, async alt_text => {
    const input = Object.freeze({ ...intent, media_working: Object.freeze({ kind: "media", asset_key, alt_text }) });
    const original = structuredClone(input); const f = fixture(input);
    expect(await f.add()).toEqual(success); expect(input).toEqual(original);
    expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
    expect(Object.hasOwn(globalThis, "privateMediaExecuted")).toBe(false);
  });
}
it.each([1, Number.MAX_SAFE_INTEGER - 1])("sends safe base revision %s and requires its exact next acknowledgment", async base_collection_revision => {
  const f = fixture({ ...intent, base_collection_revision });
  const reply = { ...success, collection_revision: base_collection_revision + 1 }; f.setReply(reply);
  expect(await f.add()).toEqual(reply);
});
it("maximum safe base permits only truthful exhausted denial, no unsafe acknowledgment", async () => {
  const f = fixture({ ...intent, base_collection_revision: Number.MAX_SAFE_INTEGER });
  f.setReply({ status: "revision_exhausted" }); expect(await f.add()).toEqual({ status: "revision_exhausted" });
});
it.each([null, undefined, {}, [], "save", { ...intent, block_id: undefined },
  ...[null, 1, true, "forged", "ABCDEF00-0000-4000-8000-000000000003"].map(block_id => ({ ...intent, block_id })),
  ...[0, -1, 1.5, "1", true, Number.MAX_SAFE_INTEGER + 1, null, undefined].map(base_collection_revision => ({ ...intent, base_collection_revision })),
  ...[null, undefined, {}, [], { ...media, kind: "generic_link" }, { ...media, owner_id: owner }, { ...media, alt_text: undefined },
    { ...media, alt_text: 1 }, { ...media, alt_text: "🙂".repeat(2049) }, { ...media, alt_text: "private\u0000" }].map(media_working => ({ ...intent, media_working })),
])("rejects malformed allocation intent %# before claims or requests", async value => {
  const f = fixture(value); expect(await f.add()).toEqual({ status: "invalid_add_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each(["owner_id", "action", "kind", "destination_url", "social_platform", "position", "is_visible", "issues", "source", "published", "neighbor_block_id", "block_ids", "direction", "undo", "operation_id", "confirm_removal"])("rejects caller %s before dispatch", async field => {
  const f = fixture({ ...intent, [field]: "forged" }); expect(await f.add()).toEqual({ status: "invalid_add_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each([null, "", "forged"])("invalid initial subject %j never dispatches mutation", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub)); expect(await f.add()).toEqual({ status: "unauthenticated" });
  expect(f.calls).toEqual([]);
});
it("claims error cannot trust supplied subject", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private")));
  expect(await f.add()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
const denials = [
  { status: "owner_missing", owner_id: null, account_state: null, onboarding_completed: null },
  { status: "onboarding_incomplete", owner_id: owner, account_state: "active", onboarding_completed: false },
  { status: "restricted", owner_id: owner, account_state: "restricted", onboarding_completed: true },
  { status: "suspended", owner_id: owner, account_state: "suspended", onboarding_completed: true },
];
it.each(denials)("initial $status returns only denial before mutation", async state => {
  const f = fixture(); f.states[0] = state; expect(await f.add()).toEqual({ status: state.status }); expect(f.calls).toEqual([stateRpc]);
});
it.each(denials)("post-commit $status discards acknowledgment without claiming rollback", async state => {
  const f = fixture(); f.states[1] = state; expect(await f.add()).toEqual({ status: "outcome_unknown" });
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});
for (const phase of [0, 1]) {
  it.each([null, {}, { ...active, owner_id: "forged" }, { ...active, onboarding_completed: false },
    { ...active, metadata: { owner_id: owner } },
    { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null },
  ])(`malformed proof ${phase} fails without leaking IDs`, async state => {
    const f = fixture(); f.states[phase] = state;
    expect(await f.add()).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
    expect(f.calls).toHaveLength(phase === 0 ? 1 : 3);
  });
}
it.each(["session", "subject", "binding"])("changed post-commit %s has unknown outcome, no private acknowledgment", async change => {
  const f = fixture(); if (change === "binding") f.states[1] = { ...active, owner_id: other };
  else f.claims.mockResolvedValueOnce(f.claim()).mockResolvedValueOnce(f.claim(change === "session" ? null : other));
  expect(await f.add()).toEqual({ status: "outcome_unknown" });
});
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_add_intent", "invalid_asset", "stale_write", "revision_exhausted", "position_exhausted"])("returns strict known no-write %s without retry/default/partial data", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.add()).toEqual({ status });
  expect(f.calls).toEqual([stateRpc, mutationRpc]); expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each([null, {}, { ...success, media_working: media }, { ...success, is_visible: true }, { ...success, action: "add_text_block" }, { ...success, block_id: null }, { ...success, collection_revision: "2" }, { ...success, confirm_removal: true }, { ...success, direction: "down" },
  { ...success, collection_revision: undefined }, { ...success, collection_revision: 1 }, { ...success, collection_revision: 3 },
  { ...success, collection_revision: Number.MAX_SAFE_INTEGER + 1 }, { ...success, block_id: undefined },
  { ...success, block_id: "forged" }, { ...success, block_id: other.toUpperCase().replace("9000", "ABCD") },
  { ...success, neighbor_block_id: owner }, { ...success, position: 2 }, { status: "block_not_found", collection_revision: 1 },
  { ...success, owner_id: owner }, { ...success, title: "private" }, { ...success, undo: { title: "private" } },
  { status: "stale_write", block_id: other }, { status: "public_ready" }, { status: "block_not_found" }, { status: "move_not_available" }])("untrusted acknowledgment %j cannot claim no write", async reply => {
  const f = fixture(); f.setReply(reply); expect(await f.add()).toEqual({ status: "outcome_unknown" });
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
    expect(await f.add()).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
    expect(f.fetcher).toHaveBeenCalledTimes(phase + 1);
  });
  it(`aggregate deadline on ignored request ${phase} never revives success or starts later phase`, async () => {
    vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!; let calls = 0;
    let finish!: (value: Response) => void; let signal: AbortSignal | null | undefined;
    f.fetcher.mockImplementation((input, options) => {
      if (calls++ === phase) { signal = options?.signal; return new Promise(resolve => { finish = resolve; }); }
      return original(input, options);
    });
    const pending = f.add(); await vi.advanceTimersByTimeAsync(5000);
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
    const pending = f.add(); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: phase ? "outcome_unknown" : "unavailable" }); const count = f.fetcher.mock.calls.length;
    finish(f.claim()); await vi.advanceTimersByTimeAsync(0); expect(f.fetcher).toHaveBeenCalledTimes(count);
  });
}
it("fresh explicit invocation re-proves and respects backend stale denial, never caching success or auto-retrying", async () => {
  const f = fixture(); expect(await f.add()).toEqual(success); f.states.push(active); f.setReply({ status: "stale_write" });
  expect(await f.add()).toEqual({ status: "stale_write" }); expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc, stateRpc, mutationRpc]);
});

it("maximum safe base cannot acknowledge an unsafe next revision", async () => {
  const f = fixture({ ...intent, base_collection_revision: Number.MAX_SAFE_INTEGER });
  f.setReply({ ...success, collection_revision: Number.MAX_SAFE_INTEGER + 1 });
  expect(await f.add()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([stateRpc, mutationRpc]);
});
it.each([0, 1])("claims exception in phase %s preserves dispatch outcome truth", async phase => {
  const f = fixture(); if (phase) f.claims.mockResolvedValueOnce(f.claim());
  f.claims.mockRejectedValueOnce(new Error("private claims failure"));
  expect(await f.add()).toEqual({ status: phase ? "outcome_unknown" : "unavailable" });
  expect(f.calls).toEqual(phase ? [stateRpc, mutationRpc] : []);
});

it.each(["unavailable", "position_exhausted"])("%s never creates missing member/collection, converts kinds or retries save", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.add()).toEqual({ status });
  expect(f.calls).toEqual([stateRpc, mutationRpc]); expect(f.claims).toHaveBeenCalledTimes(1);
});
it("lost save acknowledgment followed by a fresh old-base stale denial does not prove rollback or repeat automatically", async () => {
  const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementationOnce(original).mockRejectedValueOnce(new Error("lost save acknowledgment"));
  expect(await f.add()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([stateRpc]);
  f.states.push(active); f.setReply({ status: "stale_write" });
  expect(await f.add()).toEqual({ status: "stale_write" }); expect(f.fetcher).toHaveBeenCalledTimes(4);
});

it("copies raw allocation intent before a slow proof without sharing caller state", async () => {
  const value = { ...intent, media_working: { ...media, alt_text: "  original\r\n🙂  " } };
  const f = fixture(value); let finish!: (value: ReturnType<typeof f.claim>) => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.add();
  value.media_working.alt_text = "Changed after invocation"; value.media_working.asset_key = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; value.base_collection_revision = 99; value.is_visible = true;
  finish(f.claim());
  expect(await pending).toEqual(success);
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});
it("slow claims consume the same aggregate deadline without restarting the mutation budget", async () => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  f.claims.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(f.claim()), 3000)));
  let finish!: (value: Response) => void;
  f.fetcher.mockImplementationOnce(original).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const settled = vi.fn(); const pending = f.add().then(value => { settled(); return value; });
  await vi.advanceTimersByTimeAsync(3000); expect(f.fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1999); expect(settled).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(await pending).toEqual({ status: "outcome_unknown" });
  finish(new Response(JSON.stringify(success))); await vi.advanceTimersByTimeAsync(0);
  expect(f.fetcher).toHaveBeenCalledTimes(2); expect(f.claims).toHaveBeenCalledTimes(1);
});

for (const field of ["kind", "asset_key", "alt_text"]) {
  it(`missing Media ${field} never defaults, clears or dispatches`, async () => {
    const payload: Record<string, unknown> = { ...media }; delete payload[field];
    const f = fixture({ ...intent, media_working: payload });
    expect(await f.add()).toEqual({ status: "invalid_add_intent" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
}
for (const field of ["asset_key", "alt_text"]) {
  it.each([true, 42, [], {}])(`wrong Media ${field} type %j never coerces before auth`, async value => {
    const f = fixture({ ...intent, media_working: { ...media, [field]: value } });
    expect(await f.add()).toEqual({ status: "invalid_add_intent" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
}
it.each([
  { ...media, asset_key: "working/profile/private.webp" }, { ...media, asset_key: "https://private.example/image" },
  { ...media, asset_key: "not-uuid" }, { ...media, alt_text: "private\u0000" },
  ...["owner_id", "asset_state", "object_key", "url", "byte_size", "width", "height", "source_upload_intent_id", "safe", "issues", "label", "contact_type", "value"].map(field=>({...media,[field]:null})),
])("rejects unsupported or extra Media payload %j before I/O", async media_working => {
  const f = fixture({ ...intent, media_working });
  expect(await f.add()).toEqual({ status: "invalid_add_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it("preserves upper-case UUID input and trusts only backend invalid_asset denial without retry",async()=>{
  const input={...intent,media_working:{...media,asset_key:asset.toUpperCase()}};
  const f=fixture(input);f.setReply({status:"invalid_asset"});
  expect(await f.add()).toEqual({status:"invalid_asset"});
  expect(input.media_working.asset_key).toBe(asset.toUpperCase());
  expect(f.calls).toEqual([stateRpc,mutationRpc]);expect(f.claims).toHaveBeenCalledTimes(1);
});
it.each([
  { block_id: other, base_collection_revision: 1, text_working: { kind: "text", text: null } },
  { block_id: other, base_collection_revision: 1,
    link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } },
])("does not convert other allocation intents %j", async value => {
  const f = fixture(value); expect(await f.add()).toEqual({ status: "invalid_add_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it("never generates a new member UUID or resolves a target before backend allocation acknowledgment", async () => {
  const uuid = vi.spyOn(crypto, "randomUUID"); const f = fixture();
  expect(await f.add()).toEqual(success); expect(uuid).not.toHaveBeenCalled();
  expect(f.calls).toEqual([stateRpc, mutationRpc, stateRpc]);
});

it.each([null,undefined,0,1,"true"])("rejects nonboolean visibility %j before allocation",async is_visible=>{
 const f=fixture({...intent,is_visible});expect(await f.add()).toEqual({status:"invalid_add_intent"});
 expect(f.claims).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it.each([null,undefined,"add_media_block ","initialize_media_block","save_media_block"])("requires explicit addition action %j",async action=>{
 const f=fixture({...intent,action});await expect(f.add()).resolves.toEqual({status:"invalid_add_intent"});
 expect(f.claims).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});
it("accepts a strict backend allocated ID without inventing a caller-known ID",async()=>{
 const f=fixture();const ack={...success,block_id:subject};f.setReply(ack);
 expect(await f.add()).toEqual(ack);expect(f.calls).toEqual([stateRpc,mutationRpc,stateRpc]);
});
it("explicit visibility and raw payload are copied together",async()=>{
 for(const is_visible of [true,false]){const f=fixture({...intent,is_visible});expect(await f.add()).toEqual(success);}
});
