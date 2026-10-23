import { afterEach, expect, it, vi } from "vitest";
import { identityContactSaveIntentSchema, inspectIdentityContactSaveIntent as inspect } from "./identity-contact-save-intent";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";
import { identityTextSaveIntentSchema } from "./identity-text-save-intent";
import { identityContactAdditionIntentSchema } from "./identity-contact-addition-intent";
const working = { kind: "contact", contact_type: "email", label: null, value: "Private invalid contact" };
const id = "a8800000-0000-4000-8000-000000000011";
const intent = { block_id: id, base_collection_revision: 1, contact_working: working };
afterEach(() => vi.unstubAllGlobals());
it.each([id, "b8800000-0000-4000-8000-000000000012"])("retains canonical target %s and base without existence/Owner authority", block_id => {
  for (const base_collection_revision of [1, Number.MAX_SAFE_INTEGER]) {
    const data = { ...intent, block_id, base_collection_revision };
    expect(identityContactSaveIntentSchema.parse(data)).toEqual(data);
    expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  }
});
it.each([null, undefined, 1, [], {}, "", "../other", id.toUpperCase(), ` ${id}`, `${id} `, `${id}\n`,
  id.replaceAll("-", ""), `urn:uuid:${id}`, `https://private.example/${id}`])("rejects malformed or normalized target without changing it %#", block_id => {
  const data = { ...intent, block_id }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_save_intent" }); expect(data).toEqual(before);
});
it.each(["email", "whatsapp", "phone", null])("retains structured subtype %s without target validation", contact_type => {
  const data = { ...intent, contact_working: { ...working, contact_type } };
  expect(inspect(data)).toEqual({ status: "intent", data,
    issues: contact_type === null ? [{ field: "contact_type", code: "contact_type_required" }] : [] });
});
it.each([null, "", " ", "\u3000"])("retains raw unfinished value %#", value => {
  const data = { ...intent, contact_working: { ...working, value } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [{ field: "value", code: "value_required" }] });
});
it("retains all-null recoverable work and fixed diagnostic order", () => {
  const data = { ...intent, contact_working: { kind: "contact", contact_type: null, label: null, value: null } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [
    { field: "contact_type", code: "contact_type_required" }, { field: "value", code: "value_required" }] });
  const controls = { ...intent, contact_working: { ...data.contact_working, label: "\t", value: "\r\n" } };
  expect(inspect(controls)).toEqual({ status: "intent", data: controls, issues: [
    { field: "contact_type", code: "contact_type_required" }, { field: "value", code: "value_required" },
    { field: "label", code: "label_control_character" }, { field: "value", code: "value_control_character" }] });
});
it.each([" e\u0301 é 🙂 ", '<script>globalThis.privateContactExecuted = true</script>',
  '<img src="https://private.example" onerror="privateCode()">', "javascript:private()", "https://127.0.0.1/private",
  "mailto:owner@example.test", "tel:+62 812", "https://wa.me/not-a-number", " OWNER@Example.TEST ", " +62 invalid phone ",
])("retains literal raw label/value without fetch, execution or UUID allocation %#", value => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const uuid = vi.fn(() => { throw new Error("No allocation"); }); vi.stubGlobal("crypto", { randomUUID: uuid });
  const data = Object.freeze({ ...intent, contact_working: Object.freeze({ ...working, label: value, value }) });
  const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(data).toEqual(before); expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  expect(Object.hasOwn(globalThis, "privateContactExecuted")).toBe(false);
});
it.each([1, 9, 10, 13, 31, 127])("keeps ASCII control %i raw and repairable", code => {
  const data = { ...intent, contact_working: { ...working, label: `A${String.fromCharCode(code)}`, value: `B${String.fromCharCode(code)}` } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [
    { field: "label", code: "label_control_character" }, { field: "value", code: "value_control_character" }] });
});
it.each([null, undefined, [], {}, "add_contact_block",
  ...[null, undefined, "", "add_contact_block ", "initialize_contact_block", "add_link_block", "add_text_block", "save", true].map(action => ({ ...intent, action })),
  ...[null, undefined, 0, -1, 1.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(base_collection_revision => ({ ...intent, base_collection_revision })),
  ...[null, undefined, false, true, 0, 1, "true", "false", {}, []].map(is_visible => ({ ...intent, is_visible })),
  ...[null, undefined, [], {}, "contact"].map(contact_working => ({ ...intent, contact_working })),
])("rejects malformed/coerced envelopes without partial recovery or erasure %#", value => {
  const before = structuredClone(value); expect(inspect(value)).toEqual({ status: "invalid_save_intent" }); expect(value).toEqual(before);
});
it.each(["block_id", "base_collection_revision", "contact_working"])("does not default missing outer %s", field => {
  expect(inspect(Object.fromEntries(Object.entries(intent).filter(([key]) => key !== field)))).toEqual({ status: "invalid_save_intent" });
});
it.each(["owner_id", "is_visible", "position", "neighbor_block_id", "block_ids", "source_revision", "provenance", "collection_revision",
  "published", "safe", "operation_id", "issues", "created_at", "link_working", "text_working", "href", "action_target"])("denies outer caller authority %s", field => {
  const data = { ...intent, [field]: "untrusted" }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_save_intent" }); expect(data).toEqual(before);
});
it.each(["owner_id", "block_id", "base_collection_revision", "is_visible", "position", "source", "issues", "safe", "provider_key", "published", "href", "action", "country", "normalized_value"])("denies nested authority %s", field => {
  expect(inspect({ ...intent, contact_working: { ...working, [field]: "untrusted" } })).toEqual({ status: "invalid_save_intent" });
});
it.each(["kind", "contact_type", "label", "value"])("requires explicit nested %s", field => {
  expect(inspect({ ...intent, contact_working: Object.fromEntries(Object.entries(working).filter(([key]) => key !== field)) })).toEqual({ status: "invalid_save_intent" });
});
it.each(["social", "generic_link", "text", "media", "spill_cta", "Contact", "contact ", null, undefined])("never converts %j to Contact", kind => {
  expect(inspect({ ...intent, contact_working: { ...working, kind } })).toEqual({ status: "invalid_save_intent" });
});
it.each(["label", "value"])("preserves code-point boundaries and rejects NUL/wrong storage type for %s", field => {
  const limit = field === "label" ? 512 : 2048;
  for (const character of ["a", "🙂"]) {
    const data = { ...intent, contact_working: { ...working, [field]: character.repeat(limit) } };
    expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
    expect(inspect({ ...data, contact_working: { ...data.contact_working, [field]: character.repeat(limit + 1) } })).toEqual({ status: "invalid_save_intent" });
  }
  for (const value of ["raw\u0000", 42, false, undefined, [], {}]) {
    expect(inspect({ ...intent, contact_working: { ...working, [field]: value } })).toEqual({ status: "invalid_save_intent" });
  }
});
it.each(["Email", "social", "tel", "", 1, true, [], {}])("denies unsupported contact discriminator %#", contact_type => {
  expect(inspect({ ...intent, contact_working: { ...working, contact_type } })).toEqual({ status: "invalid_save_intent" });
});
it("copies nested work and isolates diagnostic/results between invocations", () => {
  const data = Object.freeze({ ...intent, contact_working: Object.freeze({ ...working, value: " " }) });
  const result = inspect(data); if (result.status !== "intent") throw new Error("Expected intent");
  expect(result.data).not.toBe(data); expect(result.data.contact_working).not.toBe(data.contact_working);
  result.data.contact_working.value = "Changed locally"; result.data.base_collection_revision = 9; result.issues.length = 0;
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [{ field: "value", code: "value_required" }] });
  expect(data.contact_working.value).toBe(" "); expect(data.base_collection_revision).toBe(1);
});
it("keeps save separate from Contact addition and Link/Text command boundaries", () => {
  expect(inspect(intent).status).toBe("intent");
  expect(identityContactAdditionIntentSchema.safeParse(intent).success).toBe(false);
  const addition = { action: "add_contact_block", base_collection_revision: 1, is_visible: false, contact_working: working };
  expect(identityContactAdditionIntentSchema.safeParse(addition).success).toBe(true);
  expect(inspect(addition)).toEqual({ status: "invalid_save_intent" });
  expect(identityLinkEditorCommandSchema.safeParse(intent).success).toBe(false);
  expect(identityTextSaveIntentSchema.safeParse(intent).success).toBe(false);
  expect(identityLinkEditorCommandSchema.safeParse({ action: "add_link_block", base_collection_revision: 1,
    is_visible: true, link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } }).success).toBe(true);
  expect(identityTextSaveIntentSchema.safeParse({ block_id: id, base_collection_revision: 1,
    text_working: { kind: "text", text: null } }).success).toBe(true);
});
