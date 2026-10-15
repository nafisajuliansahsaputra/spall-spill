import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { identityLinkEditorCommandSchema, type IdentityLinkEditorCommand } from "./identity-link-editor-command";
import { createOwnerLinkEditorCommands } from "./owner-link-editor-commands";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const id = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "command-owner", primary_use_case: "personal" };
const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", P = "resolve_current_owner_blocks_working_page";
const actions = ["initialize_link_block", "add_link_block"] as const;
function command(action: typeof actions[number]): IdentityLinkEditorCommand {
  const rest = { is_visible: false, link_working: { kind: "generic_link" as const, title: " <Raw> ", social_platform: null, destination_url: "javascript:private" } };
  return action === "initialize_link_block" ? { action, base_collection_revision: null, ...rest }
    : { action, base_collection_revision: 4, ...rest };
}
function fixture(action: typeof actions[number]) {
  const value = command(action), original = structuredClone(value);
  const initialize = action === "initialize_link_block";
  const mutation = initialize ? "initialize_current_owner_blocks_from_link" : "add_current_owner_link_block_working";
  const revision = initialize ? 1 : 5;
  const { kind, ...raw } = value.link_working;
  const row = { block_id: id, kind, is_visible: false, position: 1, payload_state: "present", link_working: raw };
  const page = { ...context, collection: { revision, blocks: [row], has_more: false, next_after_position: null } };
  const calls: string[] = [], states: unknown[] = Array.from({ length: 8 }, () => active);
  const pages: unknown[] = [page, page]; let reply: unknown = { status: "success", block_id: id, collection_revision: revision };
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://commands.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined(); const rpc = url.pathname.split("/").at(-1)!;
    expect([S, C, P, mutation]).toContain(rpc); calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    expect(body).toEqual(rpc === mutation ? { input_intent: original } : rpc === P
      ? { input_request: { expected_collection_revision: null, after_position: null } } : {});
    const data = rpc === S ? states.shift() : rpc === C ? context : rpc === P ? pages.shift() : reply;
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://commands.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject) => ({ data: { claims: { sub } }, error: null }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims only; actual SDK transport and both existing review services.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  const commands = createOwnerLinkEditorCommands(client);
  return { value, original, mutation, revision, row, page, calls, states, pages, claims, claim, fetcher,
    run: (...inputs: [input?: unknown]) => commands.execute(inputs.length ? inputs[0] : value), setReply: (next: unknown) => { reply = next; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
for (const action of actions) {
  it(`${action} dispatches exactly one fixed mutation and keeps separate complete readback`, async () => {
    const f = fixture(action), result = await f.run();
    expect(result).toEqual({ status: action === "initialize_link_block" ? "initialized" : "allocated", block_id: id,
      collection_revision: f.revision, readback: { status: "current", relation: "same_revision", snapshot: { ...context,
        collection: { revision: f.revision, blocks: [{ ...f.row, issues: [{ field: "destination_url", code: "destination_invalid" }] }] } } } });
    expect(f.calls).toEqual([S, S, f.mutation, S, S, S, C, P, S, C, P, S, S]);
    expect(f.claims).toHaveBeenCalledTimes(8); expect(f.value).toEqual(f.original);
  });
  it.each(["social", "generic_link"] as const)(`${action} preserves %s null/raw storage intent for both visibility values`, async kind => {
    for (const is_visible of [true, false]) {
      const f = fixture(action); Object.assign(f.value, { is_visible });
      Object.assign(f.value.link_working, { kind, title: null, social_platform: " Unnormalized ", destination_url: null });
      Object.assign(f.original, structuredClone(f.value));
      const row = { ...f.row, kind, is_visible, link_working: { title: null, social_platform: " Unnormalized ", destination_url: null } };
      f.pages.fill({ ...f.page, collection: { ...f.page.collection, blocks: [row] } });
      const result = await f.run();
      if ((result.status === "allocated" || result.status === "initialized") && result.readback.status === "current") {
        expect(result.readback.snapshot.collection!.blocks[0]!.link_working).toEqual(row.link_working);
        expect(result.readback.snapshot.collection!.blocks[0]!.issues.length).toBeGreaterThan(0);
      } else throw new Error("Missing private readback");
      expect(f.calls.filter(x => x === f.mutation)).toHaveLength(1);
    }
  });
  it(`${action} copies command before caller edits across the first await`, async () => {
    const f = fixture(action), pending = f.run();
    f.value.link_working.title = "later"; Reflect.set(f.value, "action", "publish"); Reflect.set(f.value, "base_collection_revision", 99);
    expect((await pending).status).toBe(action === "initialize_link_block" ? "initialized" : "allocated");
  });
  it.each(["owner_id", "block_id", "position", "rpc", "client", "mode", "strategy", "operation_id", "readback", "source", "csrf", "published", "commands"])(`${action} rejects forged %s before auth`, async key => {
    const f = fixture(action); expect(await f.run({ ...f.value, [key]: "forged" })).toEqual({ status: "invalid_link_command" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it.each([undefined, "1", false, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])(`${action} rejects wrong base %j before auth`, async base => {
    const f = fixture(action); expect(await f.run({ ...f.value, base_collection_revision: base })).toEqual({ status: "invalid_link_command" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it(`${action} rejects the other operation's base instead of falling back`, async () => {
    const f = fixture(action); expect(await f.run({ ...f.value, base_collection_revision: action === "add_link_block" ? null : 1 })).toEqual({ status: "invalid_link_command" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it.each([null, {}, [], { status: "success", block_id: id, collection_revision: 99 }, { status: "outcome_unknown" }])(`${action} never infers success from invalid acknowledgment %j`, async reply => {
    const f = fixture(action); f.setReply(reply); expect(await f.run()).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toEqual([S, S, f.mutation]);
  });
  it.each(["unavailable", "unauthenticated", "owner_missing", "owner_not_eligible"])(`${action} preserves known %s with no readback/fallback`, async status => {
    const f = fixture(action); f.setReply({ status }); expect(await f.run()).toEqual({ status }); expect(f.calls).toEqual([S, S, f.mutation]);
  });
  it.each(["network", "permission"])(`${action} keeps %s uncertainty without retry`, async reason => {
    const f = fixture(action), original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((input, options) => String(input).endsWith(f.mutation)
      ? reason === "network" ? Promise.reject(new Error("private")) : Promise.resolve(new Response('{"message":"private"}', { status: 403 })) : original(input, options));
    expect(await f.run()).toEqual({ status: "outcome_unknown" }); expect(f.calls.filter(x => x === P)).toHaveLength(0);
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([0, 2, 3, 7])(`${action} claim loss at phase %s exposes no private result`, async phase => {
    const f = fixture(action); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockResolvedValueOnce(f.claim(null)); expect(await f.run()).toEqual({ status: phase === 0 ? "unauthenticated" : "outcome_unknown" });
    expect(f.calls.filter(x => x === f.mutation)).toHaveLength(phase === 0 ? 0 : 1);
  });
  it(`${action} exposes explicitly newer complete state after later removal`, async () => {
    const f = fixture(action); f.pages.fill({ ...f.page, collection: { revision: f.revision + 1, blocks: [], has_more: false, next_after_position: null } });
    const result = await f.run();
    expect(result).toMatchObject({ collection_revision: f.revision, readback: { status: "current", relation: "newer_revision", snapshot: { collection: { revision: f.revision + 1, blocks: [] } } } });
  });
  it(`${action} keeps acknowledgment separate from unavailable readback`, async () => {
    const f = fixture(action); f.pages[0] = { status: "unavailable" };
    expect(await f.run()).toEqual({ status: action === "add_link_block" ? "allocated" : "initialized", block_id: id, collection_revision: f.revision, readback: { status: "unavailable" } });
  });
  it(`${action} ignores a late mutation response after its bounded unknown outcome`, async () => {
    vi.useFakeTimers(); const f = fixture(action), original = f.fetcher.getMockImplementation()!;
    let release: (() => void) | undefined;
    f.fetcher.mockImplementation(async (input, options) => {
      if (String(input).endsWith(f.mutation)) await new Promise<void>(resolve => { release = resolve; });
      return original(input, options);
    });
    const pending = f.run(); await vi.advanceTimersByTimeAsync(5001);
    expect(await pending).toEqual({ status: "outcome_unknown" }); release!(); await vi.advanceTimersByTimeAsync(10000);
    expect(f.calls).toEqual([S, S, f.mutation]); expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it(`${action} preserves repeated explicit conflicts without trying another command`, async () => {
    const f = fixture(action), status = action === "add_link_block" ? "stale_write" : "already_initialized";
    f.setReply({ status }); expect(await f.run()).toEqual({ status }); expect(await f.run()).toEqual({ status });
    expect(f.calls).toEqual([S, S, f.mutation, S, S, f.mutation]);
  });
}
it.each([null, undefined, [], {}, "add_link_block", [command("add_link_block")], { command: command("add_link_block") },
  ...["publish", "remove", "initialize_from_connection", "ADD_LINK_BLOCK", "add_link_block ", ""].map(action => ({ ...command("add_link_block"), action })),
  { ...command("add_link_block"), is_visible: "false" }, { ...command("add_link_block"), link_working: { kind: "text" } },
  { ...command("add_link_block"), link_working: { ...command("add_link_block").link_working, title: "\u0000" } },
])("invalid command %j performs no claims or SDK request", async input => {
  const f = fixture("add_link_block"); expect(await f.run(input)).toEqual({ status: "invalid_link_command" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it("retains the discriminated null/number base type and existing exact raw budgets", () => {
  type Init = Extract<IdentityLinkEditorCommand, { action: "initialize_link_block" }>;
  type Add = Extract<IdentityLinkEditorCommand, { action: "add_link_block" }>;
  expectTypeOf<Init["base_collection_revision"]>().toEqualTypeOf<null>();
  expectTypeOf<Add["base_collection_revision"]>().toEqualTypeOf<number>();
  for (const action of actions) {
    const value = command(action); value.link_working.title = "😀".repeat(512);
    expect(identityLinkEditorCommandSchema.safeParse(value).success).toBe(true);
    value.link_working.title += "x"; expect(identityLinkEditorCommandSchema.safeParse(value).success).toBe(false);
  }
});
