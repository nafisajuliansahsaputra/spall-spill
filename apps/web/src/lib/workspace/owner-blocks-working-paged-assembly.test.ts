import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createOwnerBlocksWorkingPagedAssembly } from "./owner-blocks-working-paged-assembly";
import { createOwnerBlocksWorkingAssembly, type OwnerBlocksWorkingAssemblyResult } from "./owner-blocks-working-assembly";
import type { OwnerBlocksWorkingPagedAssemblyResult } from "./owner-blocks-working-paged-assembly";

it("preserves existing factory and result type compatibility with the guarded page implementation", () => {
  expect(createOwnerBlocksWorkingAssembly).toBe(createOwnerBlocksWorkingPagedAssembly);
  expectTypeOf<OwnerBlocksWorkingAssemblyResult>().toEqualTypeOf<OwnerBlocksWorkingPagedAssemblyResult>();
});

describe.each([
  { name: "established block assembly", createAssembly: createOwnerBlocksWorkingAssembly },
  { name: "explicit paged assembly", createAssembly: createOwnerBlocksWorkingPagedAssembly },
])("$name", ({ createAssembly }) => {
  const subject = "82000000-0000-4000-8000-000000000001";
  const owner = "82000000-0000-4000-8000-000000000002";
  const other = "82000000-0000-4000-8000-000000000003";
  const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
  const context = { status: "success", current_handle: "assembly-owner", primary_use_case: "business" };
  const row = { block_id: other, kind: "generic_link", is_visible: false, position: 3, payload_state: "present",
    link_working: { title: " <Private> ", social_platform: null, destination_url: "javascript:private()" } };
  const pageCollection = (collection: unknown) => collection === null ? null : { ...(collection as object), has_more: false, next_after_position: null };
  const blocks = { ...context, collection: { revision: 3, blocks: [row], has_more: false, next_after_position: null } };
  const expected = { ...blocks, collection: { revision: 3, blocks: [{ ...row,
    issues: [{ field: "destination_url", code: "destination_invalid" }] }] } };
  const stateRpc = "resolve_current_owner_state";
  const contextRpc = "resolve_current_owner_home_context";
  const blocksRpc = "resolve_current_owner_blocks_working_page";
  const sequence = [stateRpc, contextRpc, blocksRpc, stateRpc, contextRpc, blocksRpc, stateRpc];
  function fixture() {
    const states: unknown[] = [active, active, active];
    const contexts: unknown[] = [context, context]; const snapshots: unknown[] = [blocks, blocks];
    const calls: string[] = []; const requests: unknown[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input, options) => {
      const url = new URL(String(input)); expect(url.origin).toBe("https://assembly.example.test");
      expect(options!.method).toBe("POST");
      const body = JSON.parse(String(options!.body));
      expect(new Headers(options!.headers).get("content-profile")).toBe("api");
      const rpc = url.pathname.split("/").at(-1)!; calls.push(rpc);
      if (rpc === blocksRpc) { expect(Object.keys(body)).toEqual(["input_request"]); requests.push(body.input_request); }
      else expect(body).toEqual({});
      if (![stateRpc, contextRpc, blocksRpc].includes(rpc)) throw new Error("Unexpected RPC");
      const data = rpc === stateRpc ? states.shift() : rpc === contextRpc ? contexts.shift() : snapshots.shift();
      return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    });
    const client = createClient("https://assembly.example.test", "test-only-placeholder", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
    // Controlled claims; actual pinned SDK RPC transport. No live JWT/provider claim.
    const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
    const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
    return { read: createAssembly(client).read, states, contexts, snapshots, calls, requests, fetcher, claims, claim };
  }
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it("returns exact recoverable hidden link snapshot after three proofs and two independent reads", async () => {
    const f = fixture(); expect(await f.read()).toEqual(expected);
    expect(f.calls).toEqual(sequence); expect(f.claims).toHaveBeenCalledTimes(3);
  });
  it.each([null, { revision: 1, blocks: [] }, { revision: Number.MAX_SAFE_INTEGER, blocks: [] }])("preserves missing versus initialized collection %j", async collection => {
    const f = fixture(); f.snapshots.fill({ ...context, collection: pageCollection(collection) });
    expect(await f.read()).toEqual({ ...context, collection });
  });
  it.each(["social", "generic_link", "contact", "media", "text", "spill_cta"])("does not fabricate payload or permission for %s", async kind => {
    const f = fixture(); const item = { ...row, kind, link_working: null,
      payload_state: ["social", "generic_link"].includes(kind) ? "missing" : "not_implemented" };
    f.snapshots.fill({ ...blocks, collection: pageCollection({ revision: 3, blocks: [item] }) });
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
    const f = fixture(); f.snapshots[1] = { ...context, collection: pageCollection(collection) }; expect(await f.read()).toEqual({ status: "unavailable" });
    expect(f.claims).toHaveBeenCalledTimes(2);
  });
  it("rejects initialization during read without manufacturing empty data", async () => {
    const f = fixture(); f.snapshots[0] = { ...context, collection: null };
    f.snapshots[1] = { ...context, collection: pageCollection({ revision: 1, blocks: [] }) };
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

  function pagesFor(count: number) {
    const items = Array.from({ length: count }, (_, i) => ({ block_id: `b9000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      kind: "text", is_visible: i % 2 === 0, position: i + 1, payload_state: "not_implemented", link_working: null }));
    const pages = Array.from({ length: Math.max(1, Math.ceil(count / 100)) }, (_, index) => {
      const slice = items.slice(index * 100, (index + 1) * 100); const more = (index + 1) * 100 < count;
      return { ...context, collection: { revision: 3, blocks: slice, has_more: more, next_after_position: more ? slice.at(-1)!.position : null } };
    });
    return { items, pages };
  }
  it.each([101, 501, 1000])("reconstructs %s exact rows twice without skipped cursors or page metadata", async count => {
    const f = fixture(); const { items, pages } = pagesFor(count); f.snapshots.splice(0, 2, ...pages, ...pages);
    expect(await f.read()).toEqual({ ...context, collection: { revision: 3, blocks: items.map(item => ({ ...item, issues: [] })) } });
    const requests = pages.map((_, i) => ({ expected_collection_revision: i ? 3 : null, after_position: i ? i * 100 : null }));
    expect(f.requests).toEqual([...requests, ...requests]); expect(f.claims).toHaveBeenCalledTimes(3);
    expect(f.fetcher).toHaveBeenCalledTimes(pages.length * 2 + 5);
  });
  it("fails1001 engineering bound without eleventh request, partial output or middle proof", async () => {
    const f = fixture(); const { pages } = pagesFor(1001); f.snapshots.splice(0, 2, ...pages, ...pages);
    expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.requests).toHaveLength(10); expect(f.claims).toHaveBeenCalledTimes(1);
  });
  for (const pass of [0, 1]) {
    it.each(["stale", "missing", "revision", "context", "duplicate", "backward", "bad_cursor"])(`traversal ${pass} continuation ${"%s"} never returns accumulated private rows`, async fault => {
      const f = fixture(); const { pages } = pagesFor(101); const all: unknown[] = structuredClone([...pages, ...pages]);
      const at = pass * 2 + 1; const page = structuredClone(pages[1]!);
      if (fault === "stale") all[at] = { status: "stale_read" };
      else if (fault === "missing") all[at] = { ...context, collection: null };
      else if (fault === "revision") all[at] = { ...page, collection: { ...page.collection, revision: 4 } };
      else if (fault === "context") all[at] = { ...page, primary_use_case: "personal" };
      else {
        const item = { ...page.collection.blocks[0]! };
        if (fault === "duplicate") item.block_id = pages[0]!.collection.blocks[0]!.block_id;
        if (fault === "backward") item.position = 99;
        all[at] = { ...page, collection: { ...page.collection, blocks: [item], ...(fault === "bad_cursor" ? { next_after_position: 101 } : {}) } };
      }
      f.snapshots.splice(0, 2, ...all); expect(await f.read()).toEqual({ status: "unavailable" });
      expect(f.requests).toHaveLength(at + 1); expect(f.claims).toHaveBeenCalledTimes(pass + 1);
    });
    it(`traversal ${pass} late continuation stops all further phases and cannot revive snapshot`, async () => {
      vi.useFakeTimers(); const f = fixture(); const { pages } = pagesFor(201); f.snapshots.splice(0, 2, ...pages, ...pages);
      const original = f.fetcher.getMockImplementation()!; let pageCalls = 0; let finish!: (value: Response) => void;
      f.fetcher.mockImplementation((input, options) => {
        if (String(input).endsWith(blocksRpc) && pageCalls++ === pass * 3 + 1) return new Promise(resolve => { finish = resolve; });
        return original(input, options);
      });
      const pending = f.read(); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
      const count = f.fetcher.mock.calls.length; finish(new Response(JSON.stringify(pages[1])));
      await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" }); expect(f.fetcher).toHaveBeenCalledTimes(count);
    });
  }
  it("rejects same-revision drift on later page of second traversal", async () => {
    const f = fixture(); const { pages } = pagesFor(101); const changed = structuredClone(pages[1]!); changed.collection.blocks[0]!.is_visible = false;
    f.snapshots.splice(0, 2, ...pages, pages[0]!, changed); expect(await f.read()).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(2);
  });

});
