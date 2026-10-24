import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import type { IdentityContactEditorCommand } from "./identity-contact-editor-command";
import { identityContactSaveIntentSchema } from "./identity-contact-save-intent";
import { createOwnerContactEditorCommands, type OwnerContactEditorCommandResult } from "./owner-contact-editor-commands";

const subject = "90000000-0000-4000-8000-000000000001";
const owner = "90000000-0000-4000-8000-000000000002";
const id = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "contact-command-owner", primary_use_case: "personal" };
const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", T = "resolve_current_owner_contact_block_working";
const actions = ["add_contact_block", "initialize_contact_block", "save_contact_block"] as const;
type Action = typeof actions[number];
function command(action: Action): IdentityContactEditorCommand {
  const contact_working = { kind: "contact" as const, contact_type: "email" as const, label: " Raw Label ", value: " <Raw> 🐈 " };
  return action === "initialize_contact_block" ? { action, base_collection_revision: null, is_visible: false, contact_working }
    : action === "add_contact_block" ? { action, base_collection_revision: 4, is_visible: false, contact_working }
      : { action, block_id: id, base_collection_revision: 4, contact_working };
}
function fixture(action: Action) {
  const value = command(action), original = structuredClone(value);
  const initialize = action === "initialize_contact_block", save = action === "save_contact_block";
  const mutation = initialize ? "initialize_current_owner_blocks_from_contact" : save
    ? "save_current_owner_block_contact_working" : "add_current_owner_contact_block_working";
  const revision = initialize ? 1 : 5, status = initialize ? "initialized" : save ? "saved" : "allocated";
  const row = { block_id: id, kind: "contact", is_visible: save, position: initialize ? 1 : 7,
    payload_state: "present", contact_working: { contact_type: value.contact_working.contact_type, label: value.contact_working.label, value: value.contact_working.value } };
  const contactReply = { ...context, collection_revision: revision, block: row };
  const calls: string[] = [], states: unknown[] = Array.from({ length: 8 }, () => active);
  const contacts: unknown[] = [contactReply, contactReply]; let reply: unknown = { status: "success", block_id: id, collection_revision: revision };
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://contact-commands.example.test");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeDefined(); const rpc = url.pathname.split("/").at(-1)!;
    expect([S, C, T, mutation]).toContain(rpc); calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    const expected = original.action === "save_contact_block" ? { input_working: { block_id: original.block_id,
      base_collection_revision: original.base_collection_revision, contact_working: original.contact_working } } : { input_intent: original };
    expect(body).toEqual(rpc === mutation ? expected : rpc === T ? { input_block_id: id } : {});
    const data = rpc === S ? states.shift() : rpc === C ? context : rpc === T ? contacts.shift() : reply;
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://contact-commands.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject) => ({ data: { claims: { sub } }, error: null }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled claims only; actual pinned SDK, reviews and selected Contact assembly.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  const commands = createOwnerContactEditorCommands(client);
  return { value, original, mutation, revision, status, row, contactReply, calls, states, contacts, claims, claim, fetcher,
    run: (...inputs: [input?: unknown]) => commands.execute(inputs.length ? inputs[0] : value), setReply: (next: unknown) => { reply = next; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
for (const action of actions) {
  it(`${action} dispatches one fixed mutation with eight proofs and selected readback`, async () => {
    const f = fixture(action);
    expect(await f.run()).toEqual({ status: f.status, block_id: id, collection_revision: f.revision,
      readback: { status: "current", relation: "same_revision", snapshot: { ...f.contactReply, block: { ...f.row, issues: [] } } } });
    expect(f.calls).toEqual([S, S, f.mutation, S, S, S, C, T, S, C, T, S, S]);
    expect(f.claims).toHaveBeenCalledTimes(8); expect(f.value).toEqual(f.original);
  });
  for(const contact_type of [null,"email","whatsapp","phone"] as const) {
    it.each([null, "", " \t\r\n", "x\u0001", "<script>no()</script>", "e\u0301🐈", "🐈".repeat(2048)])(`${action} retains raw Contact ${contact_type} %#`, async value => {
      for (const visible of [false, true]) {
        const f = fixture(action); Object.assign(f.value.contact_working,{contact_type,label:null,value});
        Object.assign(f.original, structuredClone(f.value));
        if (action !== "save_contact_block") { Reflect.set(f.value, "is_visible", visible); Reflect.set(f.original, "is_visible", visible); }
        const working={contact_type,label:null,value};
        f.contacts.fill({ ...f.contactReply, block: { ...f.row, is_visible:visible, contact_working:working } });
        const result=await f.run();
        if (!(result.status === "allocated" || result.status === "initialized" || result.status === "saved") || result.readback.status !== "current") throw new Error("Missing selected readback");
        expect(result.readback.snapshot.block.contact_working).toEqual(working);
        expect(result.readback.snapshot.block.issues).toEqual([
          ...(contact_type===null?[{field:"contact_type",code:"contact_type_required"}]:[]),
          ...(value===null || !value.trim()?[{field:"value",code:"value_required"}]:[]),
          ...(value!==null && Array.from(value).some(char => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127)?[{field:"value",code:"value_control_character"}]:[]),
        ]);
        expect(f.calls.filter(x=>x===f.mutation)).toHaveLength(1);
      }
    });
  }
  it(`${action} copies before caller edits action/raw/base/ID across first await`, async () => {
    const f = fixture(action), pending = f.run(); f.value.contact_working.value = "later";
    Reflect.set(f.value, "action", "publish"); Reflect.set(f.value, "base_collection_revision", 99); Reflect.set(f.value, "block_id", owner);
    expect((await pending).status).toBe(f.status);
  });
  it.each(["owner_id", "position", "rpc", "client", "mode", "strategy", "operation_id", "readback", "source", "csrf", "published", "commands"])(`${action} rejects forged %s before auth`, async key => {
    const f = fixture(action); expect(await f.run({ ...f.value, [key]: "forged" })).toEqual({ status: "invalid_contact_command" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it.each([undefined, "1", false, -1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])(`${action} rejects wrong base %j before auth`, async base => {
    const f = fixture(action); expect(await f.run({ ...f.value, base_collection_revision: base })).toEqual({ status: "invalid_contact_command" });
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it(`${action} rejects mismatched creation/save selectors without inference`, async () => {
    const f = fixture(action);
    for (const input of [{ ...f.value, base_collection_revision: action === "initialize_contact_block" ? 1 : null },
      action === "save_contact_block" ? { ...f.value, is_visible: true } : { ...f.value, block_id: id },
      { ...f.value, contact_working: { ...f.value.contact_working, owner_id: owner } }]) {
      expect(await f.run(input)).toEqual({ status: "invalid_contact_command" });
    }
    expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  });
  it.each([null, {}, [], { status: "success", block_id: id, collection_revision: 99 },
    { status: "success", block_id: id, collection_revision: 5, private: true }, { status: "outcome_unknown" },
    { status: "allocated" }, { status: "saved" }, { status: "initialized" }])(`${action} never infers success from invalid acknowledgment %j`, async reply => {
    const f = fixture(action); f.setReply(reply); expect(await f.run()).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toEqual([S, S, f.mutation]);
  });
  const negatives = ["unavailable", "unauthenticated", "owner_missing", "owner_not_eligible", ...(action === "initialize_contact_block"
    ? ["invalid_initialization_intent", "already_initialized"] : action === "add_contact_block"
      ? ["invalid_add_intent", "stale_write", "revision_exhausted", "position_exhausted"]
      : ["invalid_contact_working", "stale_write", "revision_exhausted", "block_not_found", "unsupported_block_kind"])];
  it.each(negatives)(`${action} preserves terminal %s without readback/fallback`, async status => {
    const f = fixture(action); f.setReply({ status }); expect(await f.run()).toEqual({ status }); expect(f.calls).toEqual([S, S, f.mutation]);
  });
  it.each(["network", "permission"])(`${action} keeps %s uncertainty without retry`, async reason => {
    const f = fixture(action), original = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation((input, options) => String(input).endsWith(f.mutation)
      ? reason === "network" ? Promise.reject(new Error("private")) : Promise.resolve(new Response('{"message":"private"}', { status: 403 })) : original(input, options));
    expect(await f.run()).toEqual({ status: "outcome_unknown" }); expect(f.calls.filter(x => x === T)).toHaveLength(0);
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([0, 2, 3, 7])(`${action} claim loss at phase %s exposes no private result`, async phase => {
    const f = fixture(action); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
    f.claims.mockResolvedValueOnce(f.claim(null)); expect(await f.run()).toEqual({ status: phase === 0 ? "unauthenticated" : "outcome_unknown" });
    expect(f.calls.filter(x => x === f.mutation)).toHaveLength(phase === 0 ? 0 : 1);
  });
  it.each(["subject", "owner"])(`${action} final outer %s drift strips acknowledgment/snapshot`, async change => {
    const f = fixture(action);
    if (change === "owner") f.states[7] = { ...active, owner_id: id };
    else { for (let i = 0; i < 7; i++) f.claims.mockResolvedValueOnce(f.claim()); f.claims.mockResolvedValueOnce(f.claim(id)); }
    expect(await f.run()).toEqual({ status: "outcome_unknown" });
  });
  it(`${action} keeps newer missing payload separate from original acknowledgment`, async () => {
    const f = fixture(action); f.contacts.fill({ ...f.contactReply, collection_revision: f.revision + 1,
      block: { ...f.row, payload_state: "missing", contact_working: null } });
    expect(await f.run()).toMatchObject({ status: f.status, collection_revision: f.revision, readback: {
      status: "current", relation: "newer_revision", snapshot: { collection_revision: f.revision + 1, block: { payload_state: "missing", contact_working: null } } } });
  });
  it(`${action} retains ack after unavailable selected readback`, async () => {
    const f = fixture(action); f.contacts[0] = { status: "unavailable" };
    expect(await f.run()).toEqual({ status: f.status, block_id: id, collection_revision: f.revision, readback: { status: "unavailable" } });
  });
  it(`${action} ignores late mutation after bounded unknown without another command`, async () => {
    vi.useFakeTimers(); const f = fixture(action), original = f.fetcher.getMockImplementation()!; let release!: () => void;
    f.fetcher.mockImplementation(async (input, options) => {
      if (String(input).endsWith(f.mutation)) await new Promise<void>(resolve => { release = resolve; });
      return original(input, options);
    });
    const pending = f.run(); await vi.advanceTimersByTimeAsync(5001); expect(await pending).toEqual({ status: "outcome_unknown" });
    release(); await vi.advanceTimersByTimeAsync(10000); expect(f.calls).toEqual([S, S, f.mutation]); expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it(`${action} outer deadline cannot cancel an invoked nested lifecycle or revive output`, async () => {
    vi.useFakeTimers(); const f = fixture(action), original = f.fetcher.getMockImplementation()!; let first = true;
    f.fetcher.mockImplementation(async (input, options) => {
      if (first) { first = false; await new Promise(resolve => setTimeout(resolve, 9000)); } return original(input, options);
    });
    let finish!: (value: ReturnType<typeof f.claim>) => void;
    f.claims.mockResolvedValueOnce(f.claim()).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.run(); await vi.advanceTimersByTimeAsync(10000); expect(await pending).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toEqual([S]); finish(f.claim()); await vi.advanceTimersByTimeAsync(5000);
    expect(f.calls).toEqual([S, S, f.mutation, S]); expect(await pending).toEqual({ status: "outcome_unknown" });
  });
  it(`${action} explicit invocation after unknown re-proves and returns conflict without reconciliation`, async () => {
    const f = fixture(action); f.setReply({ status: "outcome_unknown" }); expect(await f.run()).toEqual({ status: "outcome_unknown" });
    const status = action === "initialize_contact_block" ? "already_initialized" : "stale_write";
    f.setReply({ status }); expect(await f.run()).toEqual({ status }); expect(f.calls).toEqual([S, S, f.mutation, S, S, f.mutation]);
    expect(f.claims).toHaveBeenCalledTimes(4);
  });
}
it.each([null, undefined, [], {}, "add_contact_block", [command("add_contact_block")], { command: command("add_contact_block") },
  ...["publish", "remove", "initialize_from_connection", "ADD_CONTACT_BLOCK", "add_contact_block ", "", "add_link_block"].map(action => ({ ...command("add_contact_block"), action })),
  { ...command("add_contact_block"), is_visible: "false" }, { ...command("add_contact_block"), contact_working: { kind: "social" } },
  ...["\u0000", "🐈".repeat(2049)].map(value => ({ ...command("save_contact_block"), contact_working: { ...command("save_contact_block").contact_working, value } })),
  { ...command("save_contact_block"), block_id: "forged" }, { ...command("save_contact_block"), block_id: undefined },
])("invalid command %j performs no claims or SDK request", async input => {
  const f = fixture("add_contact_block"); expect(await f.run(input)).toEqual({ status: "invalid_contact_command" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it("save facade action remains forbidden by the unchanged direct save schema", () => {
  const value = command("save_contact_block"); expect(identityContactSaveIntentSchema.safeParse(value).success).toBe(false);
  expectTypeOf<Extract<OwnerContactEditorCommandResult, { status: "initialized" }>["collection_revision"]>().toEqualTypeOf<1>();
  expectTypeOf<Extract<OwnerContactEditorCommandResult, { status: "invalid_contact_command" }>>().toEqualTypeOf<{ status: "invalid_contact_command" }>();
});
for(const action of actions) {
  it.each([null,"🙂".repeat(512)," Label\r\n\u007f "])(`${action} preserves recoverable label %#`,async label=>{
    const f=fixture(action);f.value.contact_working.label=label;Object.assign(f.original,structuredClone(f.value));
    const working={...f.row.contact_working,label};f.contacts.fill({...f.contactReply,block:{...f.row,contact_working:working}});
    const result=await f.run();
    if(!(result.status==="allocated"||result.status==="saved"||result.status==="initialized")||result.readback.status!=="current")throw new Error("Missing label readback");
    expect(result.readback.snapshot.block.contact_working).toEqual(working);
    expect(result.readback.snapshot.block.issues).toEqual(label?.includes("\r")?[{field:"label",code:"label_control_character"}]:[]);
  });
  it.each(["contact_type","label","value"])(`${action} rejects missing raw field %s before auth`,async field=>{
    const f=fixture(action);const working:Record<string,unknown>={...f.value.contact_working};delete working[field];
    expect(await f.run({...f.value,contact_working:working})).toEqual({status:"invalid_contact_command"});
    expect(f.claims).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
  });
  it(`${action} rejects overbound label and extra target selectors before auth`,async()=>{
    const f=fixture(action);
    for(const working of [{...f.value.contact_working,label:"🙂".repeat(513)}, {...f.value.contact_working,href:"mailto:private"}]) {
      expect(await f.run({...f.value,contact_working:working})).toEqual({status:"invalid_contact_command"});
    }
    expect(f.claims).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
  });
}
