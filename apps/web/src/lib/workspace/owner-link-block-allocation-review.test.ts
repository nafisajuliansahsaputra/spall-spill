import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerLinkBlockAllocationReview } from "./owner-link-block-allocation-review";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const id = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const ack = { status: "success", block_id: id, collection_revision: 2 };
const raw = { title: " <Private> ", social_platform: null, destination_url: "javascript:private" };
const intent = { action: "add_link_block", base_collection_revision: 1, is_visible: false, link_working: { kind: "generic_link", ...raw } };
const context = { status: "success", current_handle: "review-owner", primary_use_case: "personal" };
const row = { block_id: id, kind: "generic_link", is_visible: false, position: 7, payload_state: "present", link_working: raw };
const page = { ...context, collection: { revision: 2, blocks: [row], has_more: false, next_after_position: null } };
const snapshot = { ...context, collection: { revision: 2, blocks: [{ ...row, issues: [{ field: "destination_url", code: "destination_invalid" }] }] } };
const allocated = { status: "allocated", block_id: id, collection_revision: 2 };
const unavailableReadback = { ...allocated, readback: { status: "unavailable" } };
const expected = { ...allocated, readback: { status: "current", relation: "same_revision", snapshot } };
const S = "resolve_current_owner_state", M = "add_current_owner_link_block_working";
const C = "resolve_current_owner_home_context", P = "resolve_current_owner_blocks_working_page";
const sequence = [S, S, M, S, S, S, C, P, S, C, P, S, S];
function fixture(...values: [value?: unknown]) {
  const value = values.length ? values[0] : structuredClone(intent);
  const original = structuredClone(value);
  const states: unknown[] = Array.from({ length: 8 }, () => active);
  const contexts: unknown[] = [context, context]; const pages: unknown[] = [page, page];
  const calls: string[] = [], requests: unknown[] = []; let reply: unknown = ack;
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://review.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === M) expect(body).toEqual({ input_intent: original });
    else if (rpc === P) { expect(Object.keys(body)).toEqual(["input_request"]); requests.push(body.input_request); }
    else expect(body).toEqual({});
    expect([S, M, C, P]).toContain(rpc);
    const data = rpc === S ? states.shift() : rpc === M ? reply : rpc === C ? contexts.shift() : pages.shift();
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://review.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims; actual pinned SDK, no live JWT/DB/mounted persistence claim.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  const review = createOwnerLinkBlockAllocationReview(client);
  return { add: () => review.add(value), states, contexts, pages, calls, requests, fetcher, claims, claim,
    setReply: (next: unknown) => { reply = next; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("allocates once, then separately returns complete exact raw Working readback after eight proofs", async () => {
  const f = fixture(); expect(await f.add()).toEqual(expected);
  expect(f.calls).toEqual(sequence); expect(f.claims).toHaveBeenCalledTimes(8);
  expect(f.requests).toEqual(Array.from({ length: 2 }, () => ({ expected_collection_revision: null, after_position: null })));
});
it.each(["social", "generic_link"])("preserves %s nullable/raw values and explicit visibility without normalizing", async kind => {
  for (const is_visible of [true, false]) {
    const value = { ...intent, is_visible, link_working: { kind, title: null, social_platform: " Unnormalized ", destination_url: null } };
    const f = fixture(value); const item = { ...row, kind, is_visible, link_working: { title: null, social_platform: " Unnormalized ", destination_url: null } };
    f.pages.fill({ ...page, collection: { ...page.collection, blocks: [item] } });
    const result = await f.add(); expect(result.status).toBe("allocated");
    if (result.status === "allocated" && result.readback.status === "current") {
      expect(result.readback.relation).toBe("same_revision");
      expect(result.readback.snapshot.collection!.blocks[0]!.link_working).toEqual(item.link_working);
      expect(result.readback.snapshot.collection!.blocks[0]!.issues.length).toBeGreaterThan(0);
    } else throw new Error("Missing complete readback");
    expect(value.link_working).toEqual({ kind, ...item.link_working });
  }
});
it("copies intent before the first await instead of trusting later caller mutations", async () => {
  const value = structuredClone(intent); const f = fixture(value); const pending = f.add();
  value.link_working.title = "changed after invocation"; value.base_collection_revision = 99;
  expect(await pending).toEqual(expected);
});
it.each([null, undefined, {}, [], { ...intent, owner_id: owner }, { ...intent, block_id: id },
  { ...intent, is_visible: undefined }, { ...intent, base_collection_revision: 0 },
  { ...intent, link_working: { ...intent.link_working, title: "private\u0000" } },
])("rejects malformed intent %j before any claims/RPC", async value => {
  const f = fixture(value); expect(await f.add()).toEqual({ status: "invalid_add_intent" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it.each([null, "", "forged"])("rejects initial claims %j before RPC", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub)); expect(await f.add()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
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
    expect(await f.add()).toEqual({ status: phase < 2 ? state.status : "outcome_unknown" });
    expect(f.calls.filter(x => x === M)).toHaveLength(phase < 2 ? 0 : 1);
  });
  it.each([null, {}, { ...active, owner_id: "forged" }, { ...active, private: true },
    { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null },
  ])(`proof ${phase} malformed %j fails closed`, async state => {
    const f = fixture(); f.states[phase] = state;
    expect(await f.add()).toEqual(phase < 2 ? { status: "unavailable" } : phase >= 4 && phase <= 6 ? unavailableReadback : { status: "outcome_unknown" });
  });
  it(`claim loss at proof ${phase} retains no private fields`, async () => {
    const f = fixture(); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockResolvedValueOnce(f.claim(null));
    expect(await f.add()).toEqual({ status: phase < 2 ? "unauthenticated" : "outcome_unknown" });
  });
}
for (const phase of [3, 7]) {
  it.each(["subject", "owner", "error"])(`outer proof ${phase} %s change cannot expose acknowledgment`, async change => {
    const f = fixture();
    if (change === "owner") f.states[phase] = { ...active, owner_id: id };
    else { for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
      f.claims.mockResolvedValueOnce(f.claim(change === "subject" ? id : subject, change === "error" ? new Error("private") : null)); }
    expect(await f.add()).toEqual({ status: "outcome_unknown" });
  });
}
it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid_add_intent", "stale_write", "revision_exhausted", "position_exhausted"])("returns known allocation %s without readback or retry", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.add()).toEqual({ status }); expect(f.calls).toEqual([S, S, M]);
});
it.each([null, {}, { ...ack, collection_revision: 3 }, { ...ack, owner_id: owner }, { ...ack, block_id: "forged" }, { status: "outcome_unknown" }])("invalid or lost acknowledgment %j never infers success from matching prepared pages", async reply => {
  const f = fixture(); f.setReply(reply); expect(await f.add()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([S, S, M]);
});
it.each(["network", "permission"])("lost allocation %s never reads/retries or claims rollback", async reason => {
  const f = fixture(); const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((input, options) => String(input).endsWith(M)
    ? reason === "network" ? Promise.reject(new Error("private")) : Promise.resolve(new Response('{"message":"private"}', { status: 403 }))
    : original(input, options));
  expect(await f.add()).toEqual({ status: "outcome_unknown" }); expect(f.requests).toEqual([]); expect(f.fetcher).toHaveBeenCalledTimes(3);
});
it.each([null, { ...page.collection, revision: 1 }, { ...page.collection, blocks: [] },
  ...[{ block_id: owner }, { kind: "social" }, { is_visible: true }, { payload_state: "missing", link_working: null },
    { link_working: { ...raw, title: "changed" } }, { link_working: { ...raw, destination_url: null } }]
    .map(change => ({ ...page.collection, blocks: [{ ...row, ...change }] })),
])("same/older/missing readback %j cannot erase acknowledged allocation or fabricate snapshot", async collection => {
  const f = fixture(); f.pages.fill({ ...context, collection }); expect(await f.add()).toEqual(unavailableReadback);
});
it.each([{ blocks: [] }, { blocks: [{ ...row, is_visible: true, link_working: { ...raw, title: "later edit" } }] }])("newer snapshot %j is explicit even if allocated row changed or was removed", async ({ blocks }) => {
  const f = fixture(); f.pages.fill({ ...page, collection: { ...page.collection, revision: 3, blocks } });
  const result = await f.add(); expect(result.status).toBe("allocated");
  if (result.status !== "allocated" || result.readback.status !== "current") throw new Error("Missing newer readback");
  expect(result.collection_revision).toBe(2); expect(result.readback.relation).toBe("newer_revision");
  expect(result.readback.snapshot.collection!.revision).toBe(3);
  expect(result.readback.snapshot.collection!.blocks.map(x => x.block_id)).toEqual(blocks.map(x => x.block_id));
});
it.each(["context", "revision", "content", "stale", "private"])("changed/invalid %s readback preserves only verified ack", async failure => {
  const f = fixture();
  if (failure === "context") f.contexts[1] = { ...context, primary_use_case: "business" };
  else if (failure === "revision") f.pages[1] = { ...page, collection: { ...page.collection, revision: 3 } };
  else if (failure === "content") f.pages[1] = { ...page, collection: { ...page.collection, blocks: [{ ...row, is_visible: true }] } };
  else f.pages[1] = failure === "stale" ? { status: "stale_read" } : { ...page, owner_id: owner };
  expect(await f.add()).toEqual(unavailableReadback);
});
function pagesFor(count: number) {
  const items = Array.from({ length: count }, (_, i) => i === count - 1 ? { ...row, position: i + 1 } : {
    block_id: `b9000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, kind: "text", is_visible: false, position: i + 1,
    payload_state: "not_implemented", link_working: null });
  return Array.from({ length: Math.ceil(count / 100) }, (_, i) => ({ ...page, collection: { revision: 2,
    blocks: items.slice(i * 100, (i + 1) * 100), has_more: (i + 1) * 100 < count,
    next_after_position: (i + 1) * 100 < count ? (i + 1) * 100 : null } }));
}
it.each([501, 1000])("returns complete%s row readback with one allocation and bounded RPC/proof work", async count => {
  const f = fixture(); const pages = pagesFor(count); f.pages.splice(0, 2, ...pages, ...pages);
  const result = await f.add(); expect(result.status).toBe("allocated");
  if (result.status !== "allocated" || result.readback.status !== "current") throw new Error("Missing complete readback");
  expect(result.readback.snapshot.collection!.blocks).toHaveLength(count);
  expect(f.calls.filter(x => x === M)).toHaveLength(1); expect(f.fetcher).toHaveBeenCalledTimes(11 + pages.length * 2);
  expect(f.fetcher.mock.calls.length).toBeLessThanOrEqual(31); expect(f.claims).toHaveBeenCalledTimes(8);
});
it("over1000 readback is unavailable without eleventh page or losing known allocation", async () => {
  const f = fixture(); f.pages.splice(0, 2, ...pagesFor(1001)); expect(await f.add()).toEqual(unavailableReadback);
  expect(f.requests).toHaveLength(10); expect(f.calls.filter(x => x === M)).toHaveLength(1);
});
for (const phase of Array.from({ length: 8 }, (_, i) => i)) {
  it(`ignored late claims proof ${phase} cannot revive output or start later composition phases`, async () => {
    vi.useFakeTimers(); const f = fixture(); let finish!: (value: ReturnType<typeof f.claim>) => void;
    for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.add(); await vi.advanceTimersByTimeAsync(10000);
    expect(await pending).toEqual(phase < 2 ? { status: "unavailable" } : phase >= 4 && phase <= 6 ? unavailableReadback : { status: "outcome_unknown" });
    const count = f.fetcher.mock.calls.length; finish(f.claim()); await vi.advanceTimersByTimeAsync(10000);
    expect(f.fetcher).toHaveBeenCalledTimes(count);
  });
}
it.each(sequence.map((rpc, index) => ({ rpc, index })))("ignored late request $index $rpc retains truthful ack/readback uncertainty", async ({ index }) => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!; let request = 0;
  let finish!: (value: Response) => void;
  f.fetcher.mockImplementation((input, options) => request++ === index ? new Promise(resolve => { finish = resolve; }) : original(input, options));
  const pending = f.add(); await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual(index < 2 ? { status: "unavailable" } : index >= 5 && index <= 11 ? unavailableReadback : { status: "outcome_unknown" });
  const count = f.fetcher.mock.calls.length;
  finish(new Response(JSON.stringify(sequence[index] === S ? active : sequence[index] === M ? ack : sequence[index] === C ? context : page)));
  await vi.advanceTimersByTimeAsync(10000); expect(f.fetcher).toHaveBeenCalledTimes(count);
});
it("fresh explicit invocation re-proves and allocates distinctly; never caches or refreshes original base", async () => {
  const f = fixture(); expect(await f.add()).toEqual(expected);
  f.states.push(...Array.from({ length: 8 }, () => active)); f.setReply({ status: "stale_write" });
  expect(await f.add()).toEqual({ status: "stale_write" }); expect(f.calls.filter(x => x === M)).toHaveLength(2);
  expect(f.requests).toHaveLength(2);
});
for (const pass of [0, 1]) {
  it.each(["stale", "duplicate", "order", "context"])(`pass ${pass} continuation %s cannot return partial rows or erase ack`, async fault => {
    const f = fixture(); const pages = pagesFor(501); const second = structuredClone(pages[1]!);
    const all: unknown[] = [...pages, ...pages];
    if (fault === "stale") all[pass * pages.length + 1] = { status: "stale_read" };
    else {
      if (fault === "duplicate") second.collection.blocks[0]!.block_id = pages[0]!.collection.blocks[0]!.block_id;
      if (fault === "order") second.collection.blocks[0]!.position = 99;
      if (fault === "context") second.current_handle = "different-owner";
      all[pass * pages.length + 1] = second;
    }
    f.pages.splice(0, 2, ...all); expect(await f.add()).toEqual(unavailableReadback);
    expect(f.requests).toHaveLength(pass * pages.length + 2); expect(f.calls.filter(x => x === M)).toHaveLength(1);
  });
  it(`late continuation pass ${pass} cannot revive partial readback or trigger another allocation`, async () => {
    vi.useFakeTimers(); const f = fixture(); const pages = pagesFor(501); f.pages.splice(0, 2, ...pages, ...pages);
    const original = f.fetcher.getMockImplementation()!; let requests = 0; let finish!: (value: Response) => void;
    f.fetcher.mockImplementation((input, options) => String(input).endsWith(P) && requests++ === pass * pages.length + 1
      ? new Promise(resolve => { finish = resolve; }) : original(input, options));
    const pending = f.add(); await vi.advanceTimersByTimeAsync(10000); expect(await pending).toEqual(unavailableReadback);
    const count = f.fetcher.mock.calls.length; finish(new Response(JSON.stringify(pages[1])));
    await vi.advanceTimersByTimeAsync(10000); expect(f.fetcher).toHaveBeenCalledTimes(count);
    expect(f.calls.filter(x => x === M)).toHaveLength(1);
  });
}
it("outer deadline never pretends an already-invoked nested allocation was cancelled or rolled back", async () => {
  vi.useFakeTimers(); const f = fixture(); const original = f.fetcher.getMockImplementation()!; let first = true;
  f.fetcher.mockImplementation(async (input, options) => {
    if (first) { first = false; await new Promise(resolve => setTimeout(resolve, 9000)); }
    return original(input, options);
  });
  let finish!: (value: ReturnType<typeof f.claim>) => void;
  f.claims.mockResolvedValueOnce(f.claim()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = f.add(); await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toEqual({ status: "outcome_unknown" }); expect(f.calls).toEqual([S]);
  finish(f.claim()); await vi.advanceTimersByTimeAsync(5000);
  expect(f.calls).toEqual([S, S, M, S]); expect(f.requests).toEqual([]);
  expect(await pending).toEqual({ status: "outcome_unknown" });
});
it.each(sequence.map((rpc, index) => ({ rpc, index })))("network failure at request $index $rpc strips raw errors without replay", async ({ index }) => {
  const f = fixture(); const original = f.fetcher.getMockImplementation()!; let request = 0;
  f.fetcher.mockImplementation((input, options) => request++ === index ? Promise.reject(new Error("private transport detail")) : original(input, options));
  expect(await f.add()).toEqual(index < 2 ? { status: "unavailable" } : index >= 5 && index <= 11 ? unavailableReadback : { status: "outcome_unknown" });
  expect(f.calls.filter(x => x === M).length).toBeLessThanOrEqual(1);
});
for (const phase of [1, 2, 4, 5, 6]) {
  it.each(["subject", "binding"])(`nested proof ${phase} ${"%s"} change never returns a snapshot`, async change => {
    const f = fixture();
    if (change === "binding") f.states[phase] = { ...active, owner_id: id };
    else { for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim()); f.claims.mockResolvedValueOnce(f.claim(id)); }
    expect(await f.add()).toEqual(phase < 3 ? { status: "outcome_unknown" } : unavailableReadback);
  });
}
it("initial claims error never trusts supplied subject or accesses private state", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private")));
  expect(await f.add()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
