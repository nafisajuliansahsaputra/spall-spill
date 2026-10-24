import { afterEach, expect, it, vi } from "vitest";
import { identityContactInitializationIntentSchema, inspectIdentityContactInitializationIntent as inspect } from "./identity-contact-initialization-intent";
import { identityContactAdditionIntentSchema } from "./identity-contact-addition-intent";
import { identityContactSaveIntentSchema } from "./identity-contact-save-intent";
import { identityTextInitializationIntentSchema } from "./identity-text-initialization-intent";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";

const working = { kind: "contact", contact_type: "email", label: null, value: "Private Contact" };
const intent = { action: "initialize_contact_block", base_collection_revision: null, is_visible: true, contact_working: working };
afterEach(() => vi.unstubAllGlobals());

it.each([true, false])("retains explicit visibility %s without public or allocation authority", is_visible => {
  {
    const data = { ...intent, is_visible };
    expect(identityContactInitializationIntentSchema.parse(data)).toEqual(data);
    expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  }
});
it.each([null, "", " ", "\t\r\n", "\u3000"])("retains unfinished raw Contact %j with fixed local issues", text => {
  const data = { ...intent, contact_working: { ...working, value: text } };
  expect(inspect(data)).toEqual({ status: "intent", data,
    issues: [{ field: "value", code: "value_required" }, ...(text === "\t\r\n" ? [{field:"value",code:"value_control_character"}] : [])] });
});
it.each(["  e\u0301 and é 🙂  ", "First\r\nSecond\tline\nLast\r",
  '<script>globalThis.privateTextExecuted = true</script>', '<img src="https://private.example" onerror="privateCode()">',
  "<style>body{display:none}</style>", "**literal** [label](javascript:private)",
  "https://127.0.0.1/private", "mailto:owner@example.test", "+62 812 3456 7890",
])("preserves literal input without network, conversion or UUID allocation %j", text => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const uuid = vi.fn(() => { throw new Error("No allocation"); }); vi.stubGlobal("crypto", { randomUUID: uuid });
  const data = Object.freeze({ ...intent, contact_working: Object.freeze({ ...working, value: text }) });
  const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "intent", data, issues: text === "First\r\nSecond\tline\nLast\r" ? [{field:"value",code:"value_control_character"}] : [] });
  expect(data).toEqual(before); expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  expect(Object.hasOwn(globalThis, "privateTextExecuted")).toBe(false);
});
it.each([1, 8, 11, 12, 14, 27, 31, 127])("keeps control U+%i repairable", code => {
  const data = { ...intent, contact_working: { ...working, value: `Keep${String.fromCharCode(code)}this` } };
  expect(inspect(data)).toEqual({ status: "intent", data,
    issues: [{ field: "value", code: "value_control_character" }] });
});
it.each([null, undefined, [], {}, "initialize_contact_block",
  ...[null, undefined, "", "initialize_contact_block ", "add_contact_block", "add_link_block", "save", true].map(action => ({ ...intent, action })),
  ...[undefined, 0, 1, -1, 1.5, "1", "null", false, {}, [], NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1].map(base_collection_revision => ({ ...intent, base_collection_revision })),
  ...[null, undefined, 0, 1, "true", "false", {}, []].map(is_visible => ({ ...intent, is_visible })),
  ...[null, undefined, [], {}, "text"].map(contact_working => ({ ...intent, contact_working })),
])("rejects malformed/coerced envelopes without input erasure %#", value => {
  const before = structuredClone(value);
  expect(inspect(value)).toEqual({ status: "invalid_initialization_intent" }); expect(value).toEqual(before);
});
it.each(["action", "base_collection_revision", "is_visible", "contact_working"])("never defaults missing %s", field => {
  expect(inspect(Object.fromEntries(Object.entries(intent).filter(([key]) => key !== field))))
    .toEqual({ status: "invalid_initialization_intent" });
});
it.each(["owner_id", "block_id", "position", "neighbor_block_id", "block_ids", "source_revision", "provenance",
  "collection_revision", "published", "safe", "operation_id", "issues", "created_at", "link_working", "html"])("rejects outer caller authority %s", field => {
  const data = { ...intent, [field]: "private-forged" }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_initialization_intent" }); expect(data).toEqual(before);
});
it.each(["owner_id", "block_id", "position", "source", "issues", "safe", "provider_key", "published", "html", "format", "destination_url"])("rejects nested authority or format %s", field => {
  expect(inspect({ ...intent, contact_working: { ...working, [field]: "private-forged" } })).toEqual({ status: "invalid_initialization_intent" });
});
it.each(["kind", "contact_type", "label", "value"])("requires explicit nested %s", field => {
  expect(inspect({ ...intent, contact_working: Object.fromEntries(Object.entries(working).filter(([key]) => key !== field)) }))
    .toEqual({ status: "invalid_initialization_intent" });
});
it.each(["social", "generic_link", "text", "media", "spill_cta", "Contact", "contact ", null, undefined])("does not convert %j to Contact", kind => {
  expect(inspect({ ...intent, contact_working: { ...working, kind } })).toEqual({ status: "invalid_initialization_intent" });
});
it.each(["a", "🙂"])("keeps the code-point engineering envelope for %s", character => {
  const data = { ...intent, contact_working: { ...working, value: character.repeat(2048) } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(inspect({ ...data, contact_working: { ...data.contact_working, value: data.contact_working.value + character } }))
    .toEqual({ status: "invalid_initialization_intent" });
});
it.each(["private\u0000text", 42, false, undefined, [], {}])("rejects invalid Contact value storage shape without partial coercion %#", text => {
  const data = { ...intent, contact_working: { ...working, value: text } }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_initialization_intent" }); expect(data).toEqual(before);
});
it("copies nested work and isolates issues/results between invocations", () => {
  const data = Object.freeze({ ...intent, contact_working: Object.freeze({ ...working, value: " " }) });
  const result = inspect(data);
  if (result.status !== "intent") throw new Error("Expected intent");
  expect(result.data).not.toBe(data); expect(result.data.contact_working).not.toBe(data.contact_working);
  result.data.contact_working.value = "Changed locally"; result.data.is_visible = false; result.issues.length = 0;
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [{ field: "value", code: "value_required" }] });
  expect(data.contact_working.value).toBe(" "); expect(data.base_collection_revision).toBe(null);
});
it("does not widen the mounted candidate Link command boundary", () => {
  expect(inspect(intent).status).toBe("intent");
  expect(identityLinkEditorCommandSchema.safeParse(intent).success).toBe(false);
  expect(identityLinkEditorCommandSchema.safeParse({ action: "add_link_block", base_collection_revision: 1,
    is_visible: true, link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } }).success).toBe(true);
});

it("keeps expected absence distinct from actual absence, initialized-empty and existing add/save intent", () => {
  expect(inspect(intent)).toEqual({ status: "intent", data: intent, issues: [] });
  expect(identityContactAdditionIntentSchema.safeParse(intent).success).toBe(false);
  expect(identityContactSaveIntentSchema.safeParse(intent).success).toBe(false);
  const add = { ...intent, action: "add_contact_block", base_collection_revision: 1 };
  expect(identityContactAdditionIntentSchema.safeParse(add).success).toBe(true);
  expect(inspect(add)).toEqual({ status: "invalid_initialization_intent" });
  const save = { block_id: "90000000-0000-4000-8000-000000000003", base_collection_revision: 1, contact_working: working };
  expect(identityContactSaveIntentSchema.safeParse(save).success).toBe(true);
  expect(inspect(save)).toEqual({ status: "invalid_initialization_intent" });
});
it("isolates caller mutations and results across repeated initialization inspections", () => {
  const data = { ...intent, contact_working: { ...working, value: "original" } }; const first = inspect(data);
  data.contact_working.value = "caller changed";
  if (first.status !== "intent") throw new Error("Expected intent");
  expect(first.data.contact_working.value).toBe("original");
  const second = inspect(data); first.data.contact_working.value = "first changed";
  expect(second).toEqual({ status: "intent", data, issues: [] });
});

it.each(["email", "whatsapp", "phone", null])("retains structured subtype %s and raw unfinished value", contact_type => {
  const data = { ...intent, contact_working: { ...working, contact_type, label: " Label ", value: " Invalid Contact +62 " } };
  expect(inspect(data)).toEqual({ status: "intent", data,
    issues: contact_type === null ? [{ field: "contact_type", code: "contact_type_required" }] : [] });
});
it("retains all-null payload and fixed local issue order without creating records", () => {
  const data = { ...intent, contact_working: { kind: "contact", contact_type: null, label: null, value: null } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [
    {field:"contact_type",code:"contact_type_required"}, {field:"value",code:"value_required"},
  ] });
});
it.each([null, "", " Raw\r\nlabel ", "🙂".repeat(512)])("preserves exact nullable/raw/full-bound label %s", label => {
  const data = { ...intent, contact_working: { ...working, label } };
  expect(inspect(data)).toEqual({ status: "intent", data,
    issues: label === " Raw\r\nlabel " ? [{ field: "label", code: "label_control_character" }] : [] });
});
it.each(["🙂".repeat(513), "a".repeat(513), "private\u0000label"])("rejects label storage envelope without coercion %#", label => {
  expect(inspect({ ...intent, contact_working: { ...working, label } })).toEqual({ status: "invalid_initialization_intent" });
});
for (const field of ["contact_type", "label", "value"]) {
  it.each([true, 42, [], {}])(`rejects wrong ${field} storage type %#`, value => {
    expect(inspect({ ...intent, contact_working: { ...working, [field]: value } }))
      .toEqual({ status: "invalid_initialization_intent" });
  });
}
it.each(["Email", "tel", "phone ", "", "whatsApp"])("never normalizes unknown subtype %s", contact_type => {
  expect(inspect({ ...intent, contact_working: { ...working, contact_type } })).toEqual({ status: "invalid_initialization_intent" });
});
it("isolates full raw payload and local diagnostics between caller and results", () => {
  const data = { ...intent, contact_working: { kind: "contact", contact_type: null, label: " raw\tlabel ", value: "\r\n" } };
  const before = structuredClone(data); const first = inspect(data);
  expect(first).toEqual({ status: "intent", data: before, issues: [
    {field:"contact_type",code:"contact_type_required"}, {field:"value",code:"value_required"},
    {field:"label",code:"label_control_character"}, {field:"value",code:"value_control_character"},
  ] });
  if (first.status !== "intent") throw new Error("Expected intent");
  first.data.contact_working.contact_type = "phone"; first.data.contact_working.label = "changed";
  first.data.contact_working.value = "Changed"; first.issues.length = 0;
  expect(data).toEqual(before); const second = inspect(data);
  expect(second).not.toEqual(first);
  if (second.status !== "intent") throw new Error("Expected intent");
  expect(second.data).toEqual(before); expect(second.issues).toHaveLength(4);
  expect(second.data.contact_working).not.toBe(first.data.contact_working);
});

it("keeps first Text and first Contact intents separate without converting either command", () => {
  const textIntent = { action: "initialize_text_block", base_collection_revision: null, is_visible: false,
    text_working: { kind: "text", text: null } };
  expect(identityTextInitializationIntentSchema.safeParse(textIntent).success).toBe(true);
  expect(inspect(textIntent)).toEqual({ status: "invalid_initialization_intent" });
  expect(identityTextInitializationIntentSchema.safeParse(intent).success).toBe(false);
  expect(inspect(intent)).toEqual({ status: "intent", data: intent, issues: [] });
});
