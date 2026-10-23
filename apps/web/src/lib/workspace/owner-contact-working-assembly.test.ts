import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerContactWorkingAssembly } from "./owner-contact-working-assembly";
const subject = "18700000-0000-4000-8000-000000000001", owner = "18700000-0000-4000-8000-000000000002", other = "18700000-0000-4000-8000-000000000003";
const id = "18700000-0000-4000-8000-000000000011", request = { block_id: id };
const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", T = "resolve_current_owner_contact_block_working";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const context = { status: "success", current_handle: "guarded-contact-owner", primary_use_case: "business" };
const contact = { ...context, collection_revision: 3, block: { block_id: id, kind: "contact", is_visible: false,
  position: 4, payload_state: "present", contact_working: { contact_type: "email", label: null, value: "Private" } } };
function fixture() {
  const states: unknown[] = [active, active, active], contexts: unknown[] = [context, context], contacts: unknown[] = [contact, contact];
  const calls: string[] = [], delayKeys = new Set<string>(), finishes = new Map<string, () => void>();
  const replies = new Map<string, unknown>();
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://contact-assembly.example.test");
    const rpc = url.pathname.split("/").at(-1)!; expect([S, C, T]).toContain(rpc);
    expect(options!.method).toBe("POST"); expect(JSON.parse(String(options!.body))).toEqual(rpc === T ? { input_block_id: id } : {});
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.signal).toBeDefined();
    const key = `${rpc}:${calls.filter(call => call === rpc).length}`; calls.push(rpc);
    const data = replies.has(key) ? replies.get(key) : (rpc === S ? states : rpc === C ? contexts : contacts).shift();
    const response = () => data instanceof Response ? data : new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    if (delayKeys.has(key)) return new Promise(resolve => { finishes.set(key, () => resolve(response())); });
    return response();
  });
  const client = createClient("https://contact-assembly.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  // Controlled claims only; fixed RPC transport runs through the actual pinned SDK.
  const claim = (sub: unknown = subject, error: unknown = null) => ({ data: { claims: { sub } }, error }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { read: createOwnerContactWorkingAssembly(client).read, states, contexts, contacts, calls, fetcher, claims, claim, delayKeys, finishes, replies };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("returns minimal selected Contact only after all three proofs and two exact SDK observations", async () => {
  const f = fixture(); expect(await f.read(request)).toEqual({ ...contact, block: { ...contact.block, issues: [] } });
  expect(f.claims).toHaveBeenCalledTimes(3); expect(f.calls).toEqual([S, C, T, S, C, T, S]);
});
it.each([null, {}, id, { block_id: "../other" }, { ...request, owner_id: other }, { ...request, revision: 3 }])("rejects invalid request before claims or RPC %#", async value => {
  const f = fixture(); expect(await f.read(value)).toEqual({ status: "invalid_contact_block_request" });
  expect(f.claims).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
});
it.each([0, 1, 2])("denies session loss at proof phase %i without retaining private content", async phase => {
  const f = fixture(); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
  f.claims.mockResolvedValueOnce(f.claim(null)); expect(await f.read(request)).toEqual({ status: "unauthenticated" });
  expect(f.calls.filter(rpc => rpc === S)).toHaveLength(phase); expect(f.calls.filter(rpc => rpc === T)).toHaveLength(phase);
  expect(f.claims).toHaveBeenCalledTimes(phase + 1);
});
it.each([null, "", "forged", 1])("denies malformed verified subject before any RPC %#", async sub => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(sub));
  expect(await f.read(request)).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
it("does not trust a supplied subject when claims verification fails", async () => {
  const f = fixture(); f.claims.mockResolvedValue(f.claim(subject, new Error("private claims error")));
  expect(await f.read(request)).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
it.each([0, 1, 2])("denies thrown claims verification at proof phase %i without private data", async phase => {
  const f = fixture(); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
  f.claims.mockRejectedValueOnce(new Error("private claims failure"));
  expect(await f.read(request)).toEqual({ status: "unavailable" });
  expect(f.calls.filter(rpc => rpc === T)).toHaveLength(phase);
});
it.each([0, 1, 2].flatMap(phase => [
  { status: "owner_missing", owner_id: null, account_state: null, onboarding_completed: null },
  { status: "onboarding_incomplete", owner_id: owner, account_state: "active", onboarding_completed: false },
  { status: "restricted", owner_id: owner, account_state: "restricted", onboarding_completed: true },
  { status: "suspended", owner_id: owner, account_state: "suspended", onboarding_completed: true },
].map(state => ({ phase, state }))))("returns only current denial at proof $phase: $state.status", async ({ phase, state }) => {
  const f = fixture(); f.states[phase] = state; expect(await f.read(request)).toEqual({ status: state.status });
  expect(f.calls.filter(rpc => rpc === S)).toHaveLength(phase + 1); expect(f.calls.filter(rpc => rpc === T)).toHaveLength(phase);
});
it.each([0, 1, 2].flatMap(phase => [null, { ...active, owner_id: "forged" }, { ...active, private: "forged" },
  { ...active, onboarding_completed: false }, { status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null },
].map(state => ({ phase, state }))))("fails closed on malformed/inconsistent Owner proof $phase %#", async ({ phase, state }) => {
  const f = fixture(); f.states[phase] = state; expect(await f.read(request)).toEqual({ status: "unavailable" });
  expect(f.calls.filter(rpc => rpc === T)).toHaveLength(phase);
});
it.each([1, 2])("rejects changed verified subject at phase %i", async phase => {
  const f = fixture(); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
  f.claims.mockResolvedValueOnce(f.claim(other)); expect(await f.read(request)).toEqual({ status: "unavailable" });
  expect(f.calls.filter(rpc => rpc === T)).toHaveLength(phase);
});
it.each([1, 2])("rejects changed Owner binding at phase %i", async phase => {
  const f = fixture(); f.states[phase] = { ...active, owner_id: other };
  expect(await f.read(request)).toEqual({ status: "unavailable" }); expect(f.calls.filter(rpc => rpc === T)).toHaveLength(phase);
});
it.each([0, 1].flatMap(phase => [null, { ...context, current_handle: "other-context" }, { ...context, primary_use_case: "personal" },
  { ...context, owner_id: other }].map(value => ({ phase, value }))))("denies failed/drifting context read $phase %#", async ({ phase, value }) => {
  const f = fixture(); f.contexts[phase] = value; expect(await f.read(request)).toEqual({ status: "unavailable" });
  expect(f.claims).toHaveBeenCalledTimes(phase + 1);
});
it.each([0, 1])("denies unavailable selected Contact phase %i without a partial result", async phase => {
  const f = fixture(); f.contacts[phase] = { status: "unavailable" };
  expect(await f.read(request)).toEqual({ status: "unavailable" }); expect(f.claims).toHaveBeenCalledTimes(phase + 1);
});
it.each([
  { ...contact, collection_revision: 4 }, { ...contact, block: { ...contact.block, is_visible: true } },
  { ...contact, block: { ...contact.block, position: 7 } },
  { ...contact, block: { ...contact.block, payload_state: "missing", contact_working: null } },
  { ...contact, block: { ...contact.block, contact_working: { contact_type: "email", label: null, value: "Changed at same revision" } } },
  { ...contact, block: { ...contact.block, contact_working: { contact_type: null, label: null, value: null } } },
  { ...contact, block: { ...contact.block, contact_working: { ...contact.block.contact_working, contact_type: "phone" } } },
  { ...contact, block: { ...contact.block, contact_working: { ...contact.block.contact_working, label: "Changed label at same revision" } } },
])("rejects revision/membership/presence/raw-content drift without fallback %#", async changed => {
  const f = fixture(); f.contacts[1] = changed; expect(await f.read(request)).toEqual({ status: "unavailable" });
  expect(f.claims).toHaveBeenCalledTimes(2); expect(f.calls).toEqual([S, C, T, S, C, T]);
});
it.each(["email", "whatsapp", "phone", null])("preserves stable raw structured Contact subtype %s", async contact_type => {
  const f = fixture(); const data = { ...contact, block: { ...contact.block,
    contact_working: { contact_type, label: " Label ", value: " Invalid Contact@ +62 " } } }; f.contacts.fill(data);
  expect(await f.read(request)).toEqual({ ...data, block: { ...data.block,
    issues: contact_type === null ? [{ field: "contact_type", code: "contact_type_required" }] : [] } });
  expect(f.calls).toEqual([S, C, T, S, C, T, S]);
});
it.each([
  { working: { contact_type: null, label: null, value: null }, issues: [
    { field: "contact_type", code: "contact_type_required" }, { field: "value", code: "value_required" }] },
  { working: { contact_type: "phone", label: "\t", value: " \r\n" }, issues: [
    { field: "value", code: "value_required" }, { field: "label", code: "label_control_character" }, { field: "value", code: "value_control_character" }] },
  { working: { contact_type: "email", label: " e\u0301🙂 ", value: " <script>literal()</script> " }, issues: [] },
  { working: { contact_type: "whatsapp", label: "🙂".repeat(512), value: "🙂".repeat(2048) }, issues: [] },
])("preserves stable raw private/incomplete Contact with basic diagnostics %#", async ({ working, issues }) => {
  const f = fixture(); const data = { ...contact, block: { ...contact.block, contact_working: working } }; f.contacts.fill(data);
  expect(await f.read(request)).toEqual({ ...data, block: { ...data.block, issues } });
  expect(f.calls).toEqual([S, C, T, S, C, T, S]);
});
it("retains stable missing payload without fabricating initialized empty work", async () => {
  const f = fixture(); const data = { ...contact, block: { ...contact.block, payload_state: "missing", contact_working: null } }; f.contacts.fill(data);
  expect(await f.read(request)).toEqual({ ...data, block: { ...data.block, issues: [] } });
});
it.each([`${S}:0`, `${S}:1`, `${S}:2`, `${C}:0`, `${C}:1`, `${T}:0`, `${T}:1`])("does not retry transport denial at %s", async key => {
  const f = fixture(); f.replies.set(key, new Response('{"message":"private error"}', { status: 403 }));
  expect(await f.read(request)).toEqual({ status: "unavailable" });
  expect(f.calls.filter(rpc => rpc === key.split(":")[0])).toHaveLength(Number(key.split(":")[1]) + 1);
});
it.each([0, 1, 2])("stops after aggregate deadline/late claims in proof phase %i", async phase => {
  vi.useFakeTimers(); const f = fixture(); let finish!: () => void;
  for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim());
  f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(f.claim()); }));
  const pending = f.read(request); await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  const calls = [...f.calls]; finish(); await vi.advanceTimersByTimeAsync(0); expect(f.calls).toEqual(calls);
  expect(f.claims).toHaveBeenCalledTimes(phase + 1);
});
it.each([`${S}:0`, `${S}:1`, `${S}:2`, `${C}:0`, `${C}:1`, `${T}:0`, `${T}:1`])("does not revive output or later phases after ignored late SDK response %s", async key => {
  vi.useFakeTimers(); const f = fixture(); f.delayKeys.add(key); const pending = f.read(request);
  await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  const calls = [...f.calls]; expect(f.finishes.has(key)).toBe(true); f.finishes.get(key)!();
  await vi.advanceTimersByTimeAsync(0); expect(await pending).toEqual({ status: "unavailable" }); expect(f.calls).toEqual(calls);
});
it("does not reset aggregate deadline for later nested reads", async () => {
  vi.useFakeTimers(); const f = fixture(); f.claims.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(f.claim()), 3000)));
  const key = `${T}:0`; f.delayKeys.add(key); const pending = f.read(request);
  await vi.advanceTimersByTimeAsync(5000); expect(await pending).toEqual({ status: "unavailable" });
  expect(f.calls).toEqual([S, C, T]); f.finishes.get(key)!(); await vi.advanceTimersByTimeAsync(0);
  expect(f.calls).toEqual([S, C, T]); expect(f.claims).toHaveBeenCalledTimes(1);
});
it("copies request before claims and keeps explicit later reads independent without cache", async () => {
  const f = fixture(); let finish!: () => void;
  f.claims.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(f.claim()); }));
  const input = { ...request }; const pending = f.read(input); input.block_id = other; finish();
  expect(await pending).toEqual({ ...contact, block: { ...contact.block, issues: [] } });
  f.states.push(active, active, active); f.contexts.push(context, context); f.contacts.push(contact, contact);
  expect(await f.read(request)).toEqual({ ...contact, block: { ...contact.block, issues: [] } });
  expect(f.claims).toHaveBeenCalledTimes(6); expect(f.calls).toHaveLength(14);
});
