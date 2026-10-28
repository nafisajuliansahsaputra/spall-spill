import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerFirstSpillCtaInitialization } from "./owner-first-spill-cta-initialization";
import { createOwnerSpillCtaBlockAllocation } from "./owner-spill-cta-block-allocation";
import { createOwnerSpillCtaBlockWorkingReader } from "./owner-spill-cta-block-working";

const subject = "24300000-0000-4000-8000-000000000001";
const owner = "24300000-0000-4000-8000-000000000002";
const blockId = "24300000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const stateRpc = "resolve_current_owner_state";
const working = { kind: "spill_cta", target: "owner_spill" };
function fixture(initialize: boolean) {
  const input = { action: initialize ? "initialize_spill_cta_block" : "add_spill_cta_block",
    base_collection_revision: initialize ? null : 7, is_visible: false, spill_cta_working: working };
  const ack = { status: "success", block_id: blockId, collection_revision: initialize ? 1 : 8 };
  let reply: unknown = ack; const states: unknown[] = [active, active]; const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    expect(new URL(String(url)).origin).toBe("https://cta.example.test");
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined();
    const rpc = String(url).split("/").at(-1)!; calls.push(rpc);
    if (rpc !== stateRpc) expect(JSON.parse(String(options!.body))).toEqual({ input_intent: input });
    return Response.json(rpc === stateRpc ? states.shift() : reply);
  });
  const client = createClient("https://cta.example.test", "test-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue({ data: { claims: { sub: subject } }, error: null } as never);
  const run = initialize ? createOwnerFirstSpillCtaInitialization(client).initialize : createOwnerSpillCtaBlockAllocation(client).add;
  return { input, ack, states, calls, fetcher, claims, client, run, setReply: (r: unknown) => { reply = r; } };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
for (const initialize of [true, false]) {
  it(`${initialize}: explicit own-Spill intent is copied and acknowledged after matching proof`, async () => {
    const f = fixture(initialize); const saved = structuredClone(f.input);
    expect(await f.run(f.input)).toEqual(f.ack); expect(f.input).toEqual(saved);
    expect(f.calls).toEqual([stateRpc, initialize ? "initialize_current_owner_blocks_from_spill_cta" : "add_current_owner_spill_cta_block_working", stateRpc]);
    expect(f.claims).toHaveBeenCalledTimes(2);
  });
  it.each(["owner_id", "handle", "destination_url", "label", "block_id", "position", "published"])(`${initialize}: caller %s cannot select authority`, async field => {
    const f = fixture(initialize); expect(await f.run({ ...f.input, [field]: owner })).toEqual({ status: initialize ? "invalid_initialization_intent" : "invalid_add_intent" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([null, {}, { kind: "generic_link", target: "owner_spill" }, { kind: "spill_cta", target: "https://evil.test" },
    { ...working, owner_id: owner }, { ...working, label: "My label" }])(`${initialize}: malformed semantic target denied before I/O %#`, async payload => {
    const f = fixture(initialize); expect(await f.run({ ...f.input, spill_cta_working: payload })).toEqual({ status: initialize ? "invalid_initialization_intent" : "invalid_add_intent" });
    expect(f.claims).not.toHaveBeenCalled();
  });
  it(`${initialize}: does not infer operation from missing collection revision`, async () => {
    const f = fixture(initialize); expect(await f.run({ ...f.input, base_collection_revision: initialize ? 1 : null })).toEqual({ status: initialize ? "invalid_initialization_intent" : "invalid_add_intent" });
    expect(f.calls).toEqual([]);
  });
  it(`${initialize}: restriction denies before allocation`, async () => {
    const f = fixture(initialize); f.states[0] = { ...active, status: "restricted", account_state: "restricted" };
    expect(await f.run(f.input)).toEqual({ status: "restricted" }); expect(f.calls).toEqual([stateRpc]);
  });
  it.each(["subject", "owner", "restriction"])(`${initialize}: after-commit %s change cannot acknowledge Saved`, async change => {
    const f = fixture(initialize);
    if (change === "subject") f.claims.mockResolvedValueOnce({ data: { claims: { sub: subject } }, error: null } as never)
      .mockResolvedValueOnce({ data: { claims: { sub: owner } }, error: null } as never);
    if (change === "owner") f.states[1] = { ...active, owner_id: subject };
    if (change === "restriction") f.states[1] = { ...active, status: "restricted", account_state: "restricted" };
    expect(await f.run(f.input)).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toHaveLength(3);
  });
  it.each([{ status: "success", block_id: blockId, collection_revision: 9 }, { status: "success", private: "secret" }])(`${initialize}: malformed acknowledgment stays unknown %#`, async reply => {
    const f = fixture(initialize); f.setReply(reply); expect(await f.run(f.input)).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toHaveLength(2);
  });
  for (const phase of [0, 1, 2]) it(`${initialize}: aggregate deadline at phase ${phase} aborts without retry`, async () => {
    vi.useFakeTimers(); const f = fixture(initialize); const original = f.fetcher.getMockImplementation()!; let count = 0; let signal: AbortSignal | null | undefined;
    f.fetcher.mockImplementation((url, options) => count++ === phase ? new Promise(() => { signal = options?.signal; }) : original(url, options));
    const pending = f.run(f.input); await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toEqual({ status: phase === 0 ? "unavailable" : "outcome_unknown" });
    expect(signal?.aborted).toBe(true); expect(f.fetcher).toHaveBeenCalledTimes(phase + 1);
  });
  it(`${initialize}: replay denial is returned once without fallback allocation`, async () => {
    const f = fixture(initialize); const denial = { status: initialize ? "already_initialized" : "stale_write" };
    f.setReply(denial); expect(await f.run(f.input)).toEqual(denial); expect(f.calls).toHaveLength(2);
  });
}
it("selected read keeps semantic target separate from any URL/label/public readiness", async () => {
  const f = fixture(false); const data = { status: "success", current_handle: "owner-handle", primary_use_case: "personal", collection_revision: 8,
    block: { block_id: blockId, kind: "spill_cta", is_visible: false, position: 3, payload_state: "present", spill_cta_working: { target: "owner_spill" } } };
  f.fetcher.mockImplementation(async (_url, options) => { expect(JSON.parse(String(options!.body))).toEqual({ input_block_id: blockId }); return Response.json(data); });
  const reader = createOwnerSpillCtaBlockWorkingReader(f.client);
  expect(await reader.read({ block_id: blockId })).toEqual(data);
  data.block.block_id = owner; expect(await reader.read({ block_id: blockId })).toBeNull();
  expect(await reader.read({ block_id: blockId, owner_id: owner })).toBeNull();
});
it.each([
  { payload_state: "missing", spill_cta_working: null },
  { payload_state: "missing", spill_cta_working: { target: "owner_spill" } },
  { payload_state: "present", spill_cta_working: null },
  { payload_state: "present", spill_cta_working: { target: "owner_spill", destination_url: "https://evil.test" } },
])("selected read never infers missing marker or trusts extra target data %#", async payload => {
  const f = fixture(false); const data = { status: "success", current_handle: "owner-handle", primary_use_case: "personal", collection_revision: 1,
    block: { block_id: blockId, kind: "spill_cta", is_visible: true, position: 1, ...payload } };
  f.fetcher.mockImplementation(async () => Response.json(data));
  const reply = await createOwnerSpillCtaBlockWorkingReader(f.client).read({ block_id: blockId });
  expect(reply).toEqual(payload.payload_state === "missing" && payload.spill_cta_working === null ? data : null);
});
