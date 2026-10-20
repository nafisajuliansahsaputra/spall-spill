import { afterEach, expect, it, vi } from "vitest";
import { identityTextSaveIntentSchema, inspectIdentityTextSaveIntent as inspect } from "./identity-text-save-intent";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";
import { identityTextAdditionIntentSchema } from "./identity-text-addition-intent";

const working = { kind: "text", text: "Private text" };
const id = "a4500000-0000-4000-8000-000000000011";
const intent = { block_id: id, base_collection_revision: 1, text_working: working };
afterEach(() => vi.unstubAllGlobals());

it.each([id, "b4500000-0000-4000-8000-000000000012"])("retains canonical target %s without membership/existence authority", block_id => {
  for (const base_collection_revision of [1, Number.MAX_SAFE_INTEGER]) {
    const data = { ...intent, block_id, base_collection_revision };
    expect(identityTextSaveIntentSchema.parse(data)).toEqual(data);
    expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  }
});
it.each([null, undefined, 1, [], {}, "", "../other", id.toUpperCase(), ` ${id}`, `${id} `, `${id}\n`,
  id.replaceAll("-", ""), `urn:uuid:${id}`, `https://private.example/${id}`])("rejects malformed/canonicalized target without changing it %#", block_id => {
  const data = { ...intent, block_id }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_save_intent" }); expect(data).toEqual(before);
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
it.each([null, undefined, [], {}, "save_text_block",
  ...[null, undefined, "", "add_text_block ", "initialize_text_block", "add_text_block", "save_text_block", "save", true].map(action => ({ ...intent, action })),
  ...[null, undefined, 0, -1, 1.5, "1", false, true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(base_collection_revision => ({ ...intent, base_collection_revision })),
  ...[null, undefined, false, true, 0, 1, "true", "false", {}, []].map(is_visible => ({ ...intent, is_visible })),
  ...[null, undefined, [], {}, "text"].map(text_working => ({ ...intent, text_working })),
])("rejects malformed/coerced envelopes without input erasure %#", value => {
  const before = structuredClone(value);
  expect(inspect(value)).toEqual({ status: "invalid_save_intent" }); expect(value).toEqual(before);
});
it.each(["block_id", "base_collection_revision", "text_working"])("never defaults missing %s", field => {
  expect(inspect(Object.fromEntries(Object.entries(intent).filter(([key]) => key !== field))))
    .toEqual({ status: "invalid_save_intent" });
});
it.each(["owner_id", "is_visible", "position", "neighbor_block_id", "block_ids", "source_revision", "provenance",
  "collection_revision", "published", "safe", "operation_id", "issues", "created_at", "link_working", "html"])("rejects outer caller authority %s", field => {
  const data = { ...intent, [field]: "private-forged" }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_save_intent" }); expect(data).toEqual(before);
});
it.each(["owner_id", "block_id", "base_collection_revision", "is_visible", "position", "source", "issues", "safe", "provider_key", "published", "html", "format", "destination_url"])("rejects nested authority or format %s", field => {
  expect(inspect({ ...intent, text_working: { ...working, [field]: "private-forged" } })).toEqual({ status: "invalid_save_intent" });
});
it.each(["kind", "text"])("requires explicit nested %s", field => {
  expect(inspect({ ...intent, text_working: Object.fromEntries(Object.entries(working).filter(([key]) => key !== field)) }))
    .toEqual({ status: "invalid_save_intent" });
});
it.each(["social", "generic_link", "contact", "media", "spill_cta", "Text", "text ", null, undefined])("does not convert %j to Text", kind => {
  expect(inspect({ ...intent, text_working: { ...working, kind } })).toEqual({ status: "invalid_save_intent" });
});
it.each(["a", "🙂"])("keeps the code-point engineering envelope for %s", character => {
  const data = { ...intent, text_working: { ...working, text: character.repeat(16384) } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(inspect({ ...data, text_working: { ...data.text_working, text: data.text_working.text + character } }))
    .toEqual({ status: "invalid_save_intent" });
});
it.each(["private\u0000text", 42, false, undefined, [], {}])("rejects invalid text storage shape without partial coercion %#", text => {
  const data = { ...intent, text_working: { ...working, text } }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_save_intent" }); expect(data).toEqual(before);
});
it("copies nested work and isolates issues/results between invocations", () => {
  const data = Object.freeze({ ...intent, text_working: Object.freeze({ kind: "text", text: " " }) });
  const result = inspect(data);
  if (result.status !== "intent") throw new Error("Expected intent");
  expect(result.data).not.toBe(data); expect(result.data.text_working).not.toBe(data.text_working);
  result.data.text_working.text = "Changed locally"; result.data.base_collection_revision = 9; result.issues.length = 0;
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [{ field: "text", code: "text_required" }] });
  expect(data.text_working.text).toBe(" "); expect(data.base_collection_revision).toBe(1);
});
it("keeps content-save intent separate from allocation and the existing Link command", () => {
  expect(inspect(intent).status).toBe("intent");
  expect(identityTextAdditionIntentSchema.safeParse(intent).success).toBe(false);
  const addition = { action: "add_text_block", base_collection_revision: 1, is_visible: false, text_working: working };
  expect(identityTextAdditionIntentSchema.safeParse(addition).success).toBe(true);
  expect(inspect(addition)).toEqual({ status: "invalid_save_intent" });
  expect(identityLinkEditorCommandSchema.safeParse(intent).success).toBe(false);
  expect(identityLinkEditorCommandSchema.safeParse({ action: "add_link_block", base_collection_revision: 1,
    is_visible: true, link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } }).success).toBe(true);
});
