import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerBlockTextWorkingSaveReview } from "./owner-block-text-working-save-review";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const id = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const ack = { status: "success", block_id: id, collection_revision: 2 };
const raw = { text: " <Private> \r\n 🐈 " };
const intent = { block_id: id, base_collection_revision: 1, text_working: { kind: "text", ...raw } };
const context = { status: "success", current_handle: "review-owner", primary_use_case: "personal" };
const row = { block_id: id, kind: "text", is_visible: false, position: 7, payload_state: "present", text_working: raw };
const textReply = { ...context, collection_revision: 2, block: row };
const snapshot = { ...textReply, block: { ...row, issues: [] } };
const saved = { status: "saved", block_id: id, collection_revision: 2 };
const unavailableReadback = { ...saved, readback: { status: "unavailable" } };
const expected = { ...saved, readback: { status: "current", relation: "same_revision", snapshot } };
const S = "resolve_current_owner_state", M = "save_current_owner_block_text_working";
const C = "resolve_current_owner_home_context", T = "resolve_current_owner_text_block_working";
const sequence = [S, S, M, S, S, S, C, T, S, C, T, S, S];
function fixture(...values: [value?: unknown]) {
  const value = values.length ? values[0] : structuredClone(intent);
  const original = structuredClone(value);
  const states: unknown[] = Array.from({ length: 8 }, () => active);
  const contexts: unknown[] = [context, context]; const texts: unknown[] = [textReply, textReply];
  const calls: string[] = [], requests: unknown[] = []; let reply: unknown = ack;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://review.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === M) expect(body).toEqual({ input_working: original });
    else if (rpc === T) { expect(body).toEqual({ input_block_id: id }); requests.push(body); }
    else expect(body).toEqual({});
    expect([S, M, C, T]).toContain(rpc);
    const data = rpc === S ? states.shift() : rpc === M ? reply : rpc === C ? contexts.shift() : texts.shift();
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://review.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims; actual pinned SDK, no live JWT/DB/mounted persistence claim.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  const review = createOwnerBlockTextWorkingSaveReview(client);
  return { save: () => review.save(value), states, contexts, texts, calls, requests, fetcher, claims, claim,
    setReply: (next: unknown) => { reply = next; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("saves once, then separately returns selected exact raw Working readback after eight proofs", async () => {
  const f = fixture(); expect(await f.save()).toEqual(expected);
  expect(f.calls).toEqual(sequence); expect(f.claims).toHaveBeenCalledTimes(8);
  expect(f.requests).toEqual(Array.from({ length: 2 }, () => ({ input_block_id: id })));
});
it.each([null, "", "  ", "\t\r\n", "x\u0001", "<script>no()</script>", "e\u0301🐈", "🐈".repeat(16384)])("retains raw Text and local issues without public validity gate", async text => {
  for (const is_visible of [true, false]) {
    const value = { ...intent, text_working: { kind: "text", text } };
    const f = fixture(value); const item = { ...row, is_visible, text_working: { text } };
    f.texts.fill({ ...textReply, block: item }); const result = await f.save();
    if (result.status !== "saved" || result.readback.status !== "current") throw new Error("Missing selected readback");
    expect(result.readback.snapshot.block.text_working).toEqual({ text });
    expect(result.readback.snapshot.block.issues).toEqual(text === null || !text.trim() ? [{ field: "text", code: "text_required" }]
      : text.includes(String.fromCharCode(1)) ? [{ field: "text", code: "text_control_character" }] : []);
    expect(result.readback.relation).toBe("same_revision"); expect(f.calls).toEqual(sequence);
  }
});
it("copies intent before the first await instead of trusting later caller mutations", async () => {
  const value = structuredClone(intent); const f = fixture(value); const pending = f.save();
  value.text_working.text = "changed after invocation"; value.base_collection_revision = 99; value.block_id = owner;
  expect(await pending).toEqual(expected);
});
it.each([null, undefined, {}, [], { ...intent, owner_id: owner }, { ...intent, block_id: "forged" },
  { ...intent, is_visible: undefined }, { ...intent, base_collection_revision: 0 },
  { ...intent, text_working: { ...intent.text_working, text: "private\u0000" } },
])("rejects malformed intent %j before any claims/RPC", async value => {
  const f = fixture(value); expect(await f.save()).toEqual({ status: "invalid_text_working" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each([null, "", "forged"])("rejects initial claims %j before RPC", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub)); expect(await f.save()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
const denied = [
  { status: "owner_missing", owner_id: null, account_state: null, onboarding_completed: null },
  { status: "onboarding_incomplete", owner_id: owner, account_state: "active", onboarding_completed: false },
  { status: "restricted", owner_id: owner, account_state: "restricted", onboarding_completed: true },
  { status: "suspended", owner_id: owner, account_state: "suspended", onboarding_completed: true },
];
for (const phase of Array.from({ length: 8 }, (_, i) => i)) {
  it.each(denied)(`proof ${phase} $status returns no acknowledgment or snapshot`, async state => {
    const f = fixture(); f.states[phase] = state;
    expect(await f.save()).toEqual({ status: phase < 2 ? state.status : "outcome_unknown" });
    expect(f.calls.filter(x => x === M)).toHaveLength(phase < 2 ? 0 : 1);
  });
  it.each([null, {}, { ...active, owner_id: "forged" }, { ...active, private: true },
    { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null },
  ])(`proof ${phase} malformed %j fails closed`, async state => {
    const f = fixture(); f.states[phase] = state;
    expect(await f.save()).toEqual(phase < 2 ? { status: "unavailable" } : phase >= 4 && phase <= 6 ? unavailableReadback : { status: "outcome_unknown" });
  });
  it(`claim loss at proof ${phase} retains no private fields`, async () => {
    const f = fixture(); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockResolvedValueOnce(f.claim(null));
    expect(await f.save()).toEqual({ status: phase < 2 ? "unauthenticated" : "outcome_unknown" });
  });
}
for (const phase of [3, 7]) {
  it.each(["subject", "owner", "error"])(`outer proof ${phase} %s change cannot expose acknowledgment`, async change => {
    const f = fixture();
    if (change === "owner") f.states[phase] = { ...active, owner_id: id };
    else { for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
      f.claims.mockResolvedValueOnce(f.claim(change === "subject" ? id : subject, change === "error" ? new Error("private") : null)); }
    expect(await f.save()).toEqual({ status: "outcome_unknown" });
  });
}
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_text_working", "stale_write", "revision_exhausted", "block_not_found", "unsupported_block_kind"])("returns known save %s without readback or retry", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.save()).toEqual({ status }); expect(f.calls).toEqual([S, S, M]);
});
it.each([null, {}, { ...ack, collection_revision: 3 }, { ...ack, owner_id: owner }, { ...ack, block_id: "forged" }, { status: "outcome_unknown" }])("invalid or lost acknowledgment %j never infers success from matching prepared selected state", async reply => {
  const f = fixture(); f.setReply(reply); expect(await f.save()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([S, S, M]);
});
it.each(["network", "permission"])("lost save %s never reads/retries or claims rollback", async reason => {
  const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((input, options) => String(input).endsWith(M)
    ? reason === "network" ? Promise.reject(new Error("private")) : Promise.resolve(new Response('{"message":"private"}', { status: 403 }))
    : original(input, options));
  expect(await f.save()).toEqual({ status: "outcome_unknown" }); expect(f.requests).toEqual([]); expect(f.fetcher).toHaveBeenCalledTimes(3);
});
it.each([null, { ...textReply, collection_revision: 1 }, { status: "unavailable" },
  ...[{ block_id: owner }, { kind: "social" }, { payload_state: "missing", text_working: null },
    { text_working: { text: "changed" } }, { text_working: { text: null } }, { private: true }]
    .map(change => ({ ...textReply, block: { ...row, ...change } })),
])("same/older/missing selected observation cannot erase ack or fabricate snapshot", async data => {
  const f = fixture(); f.texts.fill(data); expect(await f.save()).toEqual(unavailableReadback);
});
it.each([{ ...row, is_visible: true, text_working: { text: "later edit" } },
  { ...row, payload_state: "missing", text_working: null }])("newer stable selected state is explicit even after later edits", async block => {
  const f = fixture(); f.texts.fill({ ...textReply, collection_revision: 3, block }); const result = await f.save();
  if (result.status !== "saved" || result.readback.status !== "current") throw new Error("Missing newer readback");
  expect(result.collection_revision).toBe(2); expect(result.readback.relation).toBe("newer_revision");
  expect(result.readback.snapshot.collection_revision).toBe(3); expect(result.readback.snapshot.block.block_id).toBe(id);
  expect(result.readback.snapshot.block.text_working).toEqual(block.text_working);
});
it.each(["context", "revision", "content", "stale", "private"])("changed/invalid %s observation preserves only verified ack", async failure => {
  const f = fixture();
  if (failure === "context") f.contexts[1] = { ...context, primary_use_case: "business" };
  else if (failure === "revision") f.texts[1] = { ...textReply, collection_revision: 3 };
  else if (failure === "content") f.texts[1] = { ...textReply, block: { ...row, is_visible: true } };
  else f.texts[1] = failure === "stale" ? { status: "stale_read" } : { ...textReply, owner_id: owner };
  expect(await f.save()).toEqual(unavailableReadback);
});
for (const phase of Array.from({ length: 8 }, (_, i) => i)) {
  it(`ignored late claims proof ${phase} cannot revive output or start later composition phases`, async () => {
    vi.useFakeTimers(); const f = fixture(); let finish!: (value: ReturnType<typeof f.claim>) => void;
    for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.save(); await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toEqual(phase < 2 ? { status: "unavailable" } : phase >= 4 && phase <= 6 ? unavailableReadback : { status: "outcome_unknown" });
    const count = f.fetcher.mock.calls.length; finish(f.claim()); await vi.advanceTimersByTimeAsync(10000);
    expect(f.fetcher).toHaveBeenCalledTimes(count);
  });
}
it.each(sequence.map((rpc, index) => ({ rpc, index })))("ignored late request $index $rpc retains truthful ack/readback uncertainty", async ({ index }) => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!; let request = 0;
  let finish!: (value: Response) => void;
  f.fetcher.mockImplementation((input, options) => request++ === index ? new Promise(resolve => { finish = resolve; }) : original(input, options));
  const pending = f.save(); await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual(index < 2 ? { status: "unavailable" } : index >= 5 && index <= 11 ? unavailableReadback : { status: "outcome_unknown" });
  const count = f.fetcher.mock.calls.length;
  finish(new Response(JSON.stringify(sequence[index] === S ? active : sequence[index] === M ? ack : sequence[index] === C ? context : textReply)));
  await vi.advanceTimersByTimeAsync(10000); expect(f.fetcher).toHaveBeenCalledTimes(count);
});
it("fresh explicit invocation re-proves and saves explicitly; never caches or refreshes original base", async () => {
  const f = fixture(); expect(await f.save()).toEqual(expected);
  f.states.push(...Array.from({ length: 8 }, () => active)); f.setReply({ status: "stale_write" });
  expect(await f.save()).toEqual({ status: "stale_write" }); expect(f.calls.filter(x => x === M)).toHaveLength(2);
  expect(f.requests).toHaveLength(2);
});
it("outer deadline never pretends an already-invoked nested save was cancelled or rolled back", async () => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!; let first = true;
  f.fetcher.mockImplementation(async (input, options) => {
    if (first) { first = false; await new Promise(resolve => setTimeout(resolve, 9000)); }
    return original(input, options);
  });
  let finish!: (value: ReturnType<typeof f.claim>) => void;
  f.claims.mockResolvedValueOnce(f.claim()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.save(); await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([S]);
  finish(f.claim()); await vi.advanceTimersByTimeAsync(5000);
  expect(f.calls).toEqual([S, S, M, S]); expect(f.requests).toEqual([]);
  expect(await pending).toEqual({ status: "outcome_unknown" });
});
it.each(sequence.map((rpc, index) => ({ rpc, index })))("network failure at request $index $rpc strips raw errors without replay", async ({ index }) => {
  const f = fixture(); const original = f.fetcher.getMockImplementation()!; let request = 0;
  f.fetcher.mockImplementation((input, options) => request++ === index ? Promise.reject(new Error("private transport detail")) : original(input, options));
  expect(await f.save()).toEqual(index < 2 ? { status: "unavailable" } : index >= 5 && index <= 11 ? unavailableReadback : { status: "outcome_unknown" });
  expect(f.calls.filter(x => x === M).length).toBeLessThanOrEqual(1);
});
for (const phase of [1, 2, 4, 5, 6]) {
  it.each(["subject", "binding"])(`nested proof ${phase} ${"%s"} change never returns a snapshot`, async change => {
    const f = fixture();
    if (change === "binding") f.states[phase] = { ...active, owner_id: id };
    else { for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim()); f.claims.mockResolvedValueOnce(f.claim(id)); }
    expect(await f.save()).toEqual(phase < 3 ? { status: "outcome_unknown" } : unavailableReadback);
  });
}
it("initial claims error never trusts supplied subject or accesses private state", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private")));
  expect(await f.save()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});

for (const phase of Array.from({ length: 8 }, (_, i) => i)) {
  it(`thrown claims at proof ${phase} are bounded without private errors`, async () => {
    const f = fixture(); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockRejectedValueOnce(new Error("private claims failure"));
    expect(await f.save()).toEqual(phase < 2 ? { status: "unavailable" }
      : phase >= 4 && phase <= 6 ? unavailableReadback : { status: "outcome_unknown" });
  });
}
it("unknown followed by a deliberate stale call is not causal proof or a retry", async () => {
  const f = fixture(); f.setReply(null); expect(await f.save()).toEqual({ status: "outcome_unknown" });
  f.states.push(active, active); f.setReply({ status: "stale_write" });
  expect(await f.save()).toEqual({ status: "stale_write" });
  expect(f.requests).toEqual([]); expect(f.calls.filter(rpc => rpc === M)).toHaveLength(2);
});
it("spends one outer budget across late save and readback without resetting the clock", async () => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  let finish!: (value: Response) => void;
  f.fetcher.mockImplementation(async (input, options) => {
    if (String(input).endsWith(S) && f.calls.length === 0) await new Promise(resolve => setTimeout(resolve, 6000));
    if (String(input).endsWith(T)) return new Promise(resolve => { finish = resolve; });
    return original(input, options);
  });
  const pending = f.save(); await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual({ status: "outcome_unknown" });
  const count = f.fetcher.mock.calls.length; finish(new Response(JSON.stringify(textReply)));
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual({ status: "outcome_unknown" });
  // An invoked nested read may finish privately; no later outer proof or mutation.
  expect(f.calls.filter(rpc => rpc === M)).toHaveLength(1);
  expect(f.fetcher.mock.calls.length).toBeLessThanOrEqual(count + 4);
  expect(f.claims.mock.calls.length).toBeLessThanOrEqual(7);
});

it.each([true, false])("same-revision content save observes stable visibility %s and position without selectors", async is_visible => {
  const f = fixture(); const block = { ...row, is_visible, position: 19 };
  f.texts.fill({ ...textReply, block });
  expect(await f.save()).toEqual({ ...saved, readback: { status: "current", relation: "same_revision",
    snapshot: { ...textReply, block: { ...block, issues: [] } } } });
  expect(f.calls).toEqual(sequence);
});
it.each(["add_text_block", "initialize_text_block", "save_text_block"])("rejects action %s instead of selecting another command", async action => {
  const f = fixture({ ...intent, action }); expect(await f.save()).toEqual({ status: "invalid_text_working" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it("rejects well-formed acknowledgment for a different existing block", async () => {
  const f = fixture(); f.setReply({ ...ack, block_id: owner });
  expect(await f.save()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([S, S, M]);
});
