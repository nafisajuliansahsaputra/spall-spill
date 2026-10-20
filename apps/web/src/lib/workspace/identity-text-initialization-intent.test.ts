import { afterEach, expect, it, vi } from "vitest";
import { identityTextInitializationIntentSchema, inspectIdentityTextInitializationIntent as inspect } from "./identity-text-initialization-intent";
import { identityTextAdditionIntentSchema } from "./identity-text-addition-intent";
import { identityTextSaveIntentSchema } from "./identity-text-save-intent";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";

const working = { kind: "text", text: "Private text" };
const intent = { action: "initialize_text_block", base_collection_revision: null, is_visible: true, text_working: working };
afterEach(() => vi.unstubAllGlobals());

it.each([true, false])("retains explicit visibility %s without public or allocation authority", is_visible => {
  {
    const data = { ...intent, is_visible };
    expect(identityTextInitializationIntentSchema.parse(data)).toEqual(data);
    expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  }
});
it.each([null, "", " ", "\t\r\n", "\u3000"])("retains unfinished raw Text %j with fixed local issues", text => {
  const data = { ...intent, text_working: { kind: "text", text } };
  expect(inspect(data)).toEqual({ status: "intent", data,
    issues: [{ field: "text", code: "text_required" }] });
});
it.each(["  e\u0301 and é 🙂  ", "First\r\nSecond\tline\nLast\r",
  '<script>globalThis.privateTextExecuted = true</script>', '<img src="https://private.example" onerror="privateCode()">',
  "<style>body{display:none}</style>", "**literal** [label](javascript:private)",
  "https://127.0.0.1/private", "mailto:owner@example.test", "+62 812 3456 7890",
])("preserves literal input without network, conversion or UUID allocation %j", text => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const uuid = vi.fn(() => { throw new Error("No allocation"); }); vi.stubGlobal("crypto", { randomUUID: uuid });
  const data = Object.freeze({ ...intent, text_working: Object.freeze({ kind: "text", text }) });
  const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(data).toEqual(before); expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  expect(Object.hasOwn(globalThis, "privateTextExecuted")).toBe(false);
});
it.each([1, 8, 11, 12, 14, 27, 31, 127])("keeps control U+%i repairable", code => {
  const data = { ...intent, text_working: { kind: "text", text: `Keep${String.fromCharCode(code)}this` } };
  expect(inspect(data)).toEqual({ status: "intent", data,
    issues: [{ field: "text", code: "text_control_character" }] });
});
it.each([null, undefined, [], {}, "initialize_text_block",
  ...[null, undefined, "", "initialize_text_block ", "add_text_block", "add_link_block", "save", true].map(action => ({ ...intent, action })),
  ...[undefined, 0, 1, -1, 1.5, "1", "null", false, {}, [], NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1].map(base_collection_revision => ({ ...intent, base_collection_revision })),
  ...[null, undefined, 0, 1, "true", "false", {}, []].map(is_visible => ({ ...intent, is_visible })),
  ...[null, undefined, [], {}, "text"].map(text_working => ({ ...intent, text_working })),
])("rejects malformed/coerced envelopes without input erasure %#", value => {
  const before = structuredClone(value);
  expect(inspect(value)).toEqual({ status: "invalid_initialization_intent" }); expect(value).toEqual(before);
});
it.each(["action", "base_collection_revision", "is_visible", "text_working"])("never defaults missing %s", field => {
  expect(inspect(Object.fromEntries(Object.entries(intent).filter(([key]) => key !== field))))
    .toEqual({ status: "invalid_initialization_intent" });
});
it.each(["owner_id", "block_id", "position", "neighbor_block_id", "block_ids", "source_revision", "provenance",
  "collection_revision", "published", "safe", "operation_id", "issues", "created_at", "link_working", "html"])("rejects outer caller authority %s", field => {
  const data = { ...intent, [field]: "private-forged" }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_initialization_intent" }); expect(data).toEqual(before);
});
it.each(["owner_id", "block_id", "position", "source", "issues", "safe", "provider_key", "published", "html", "format", "destination_url"])("rejects nested authority or format %s", field => {
  expect(inspect({ ...intent, text_working: { ...working, [field]: "private-forged" } })).toEqual({ status: "invalid_initialization_intent" });
});
it.each(["kind", "text"])("requires explicit nested %s", field => {
  expect(inspect({ ...intent, text_working: Object.fromEntries(Object.entries(working).filter(([key]) => key !== field)) }))
    .toEqual({ status: "invalid_initialization_intent" });
});
it.each(["social", "generic_link", "contact", "media", "spill_cta", "Text", "text ", null, undefined])("does not convert %j to Text", kind => {
  expect(inspect({ ...intent, text_working: { ...working, kind } })).toEqual({ status: "invalid_initialization_intent" });
});
it.each(["a", "🙂"])("keeps the code-point engineering envelope for %s", character => {
  const data = { ...intent, text_working: { ...working, text: character.repeat(16384) } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(inspect({ ...data, text_working: { ...data.text_working, text: data.text_working.text + character } }))
    .toEqual({ status: "invalid_initialization_intent" });
});
it.each(["private\u0000text", 42, false, undefined, [], {}])("rejects invalid text storage shape without partial coercion %#", text => {
  const data = { ...intent, text_working: { ...working, text } }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_initialization_intent" }); expect(data).toEqual(before);
});
it("copies nested work and isolates issues/results between invocations", () => {
  const data = Object.freeze({ ...intent, text_working: Object.freeze({ kind: "text", text: " " }) });
  const result = inspect(data);
  if (result.status !== "intent") throw new Error("Expected intent");
  expect(result.data).not.toBe(data); expect(result.data.text_working).not.toBe(data.text_working);
  result.data.text_working.text = "Changed locally"; result.data.is_visible = false; result.issues.length = 0;
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [{ field: "text", code: "text_required" }] });
  expect(data.text_working.text).toBe(" "); expect(data.base_collection_revision).toBe(null);
});
it("does not widen the mounted candidate Link command boundary", () => {
  expect(inspect(intent).status).toBe("intent");
  expect(identityLinkEditorCommandSchema.safeParse(intent).success).toBe(false);
  expect(identityLinkEditorCommandSchema.safeParse({ action: "add_link_block", base_collection_revision: 1,
    is_visible: true, link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } }).success).toBe(true);
});

it("keeps expected absence distinct from actual absence, initialized-empty and existing add/save intent", () => {
  expect(inspect(intent)).toEqual({ status: "intent", data: intent, issues: [] });
  expect(identityTextAdditionIntentSchema.safeParse(intent).success).toBe(false);
  expect(identityTextSaveIntentSchema.safeParse(intent).success).toBe(false);
  const add = { ...intent, action: "add_text_block", base_collection_revision: 1 };
  expect(identityTextAdditionIntentSchema.safeParse(add).success).toBe(true);
  expect(inspect(add)).toEqual({ status: "invalid_initialization_intent" });
  const save = { block_id: "90000000-0000-4000-8000-000000000003", base_collection_revision: 1, text_working: working };
  expect(identityTextSaveIntentSchema.safeParse(save).success).toBe(true);
  expect(inspect(save)).toEqual({ status: "invalid_initialization_intent" });
});
it("isolates caller mutations and results across repeated initialization inspections", () => {
  const data = { ...intent, text_working: { kind: "text", text: "original" } }; const first = inspect(data);
  data.text_working.text = "caller changed";
  if (first.status !== "intent") throw new Error("Expected intent");
  expect(first.data.text_working.text).toBe("original");
  const second = inspect(data); first.data.text_working.text = "first changed";
  expect(second).toEqual({ status: "intent", data, issues: [] });
});
