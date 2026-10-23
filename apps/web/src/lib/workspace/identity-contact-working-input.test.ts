import { afterEach, expect, it, vi } from "vitest";
import { inspectIdentityContactWorkingInput as inspect } from "./identity-contact-working-input";
import { identityBlockWorkingRowSchema } from "./owner-blocks-working";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";
import { identityTextEditorCommandSchema } from "./identity-text-editor-command";

const input = { kind: "contact", contact_type: "email", label: null, value: "owner@example.test" };
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["email", "  Owner+Tag@Example.test  "], ["whatsapp", "  0812 3456-7890  "], ["phone", "+62 (21) 1234"],
])("preserves explicit %s type and raw value without generating an action", (contact_type, value) => {
  const data = Object.freeze({ ...input, contact_type, label: "  e\u0301 🙂  ", value });
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
});
it.each([null, "", " ", "\u00a0", "\u3000"])("keeps unfinished value %j recoverable without filling an optional label", value => {
  const data = { ...input, contact_type: null, value };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [
    { field: "contact_type", code: "contact_type_required" }, { field: "value", code: "value_required" },
  ] });
});
it.each(["email", "whatsapp", "phone"])("keeps an unfinished %s value with fixed local diagnostics", contact_type => {
  const data = { ...input, contact_type, value: null };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "value", code: "value_required" }] });
});
it.each([null, "", "  ", "日本語 — é", "e\u0301"])("does not require, normalize or derive optional label %j", label => {
  const data = { ...input, label }; expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
});
it.each(["email", "whatsapp", "phone", null])("does not interpret raw values or imply target validation for type %j", contact_type => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const value of ["not a contact", "mailto:owner@example.test?subject=Private", "https://127.0.0.1/private",
    "javascript:alert(1)", '<script>globalThis.privateContactExecuted = true</script>', "<img src='https://private.test'>", "号码🙂e\u0301"]) {
    const data = Object.freeze({ ...input, contact_type, value });
    expect(inspect(data)).toEqual({ status: "working", data,
      issues: contact_type === null ? [{ field: "contact_type", code: "contact_type_required" }] : [] });
  }
  expect(fetcher).not.toHaveBeenCalled(); expect(Object.hasOwn(globalThis, "privateContactExecuted")).toBe(false);
});
it.each([1, 8, 9, 10, 13, 27, 31, 127])("retains label and value control U+%i with fixed issues and no private echo", code => {
  const raw = `Keep${String.fromCharCode(code)}private`, data = { ...input, label: raw, value: raw };
  const result = inspect(data);
  expect(result).toEqual({ status: "working", data, issues: [
    { field: "label", code: "label_control_character" }, { field: "value", code: "value_control_character" },
  ] });
  if (result.status !== "working") throw new Error("Expected recoverable Contact work");
  expect(JSON.stringify(result.issues)).not.toContain("private");
});
it("reports incomplete and control issues deterministically while preserving line breaks", () => {
  const data = { ...input, contact_type: null, label: "Private\r\n", value: "\t\r\n" };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [
    { field: "contact_type", code: "contact_type_required" }, { field: "value", code: "value_required" },
    { field: "label", code: "label_control_character" }, { field: "value", code: "value_control_character" },
  ] });
});
it.each(["a", "🙂"])("counts engineering label/value envelopes in Unicode code points for %s", character => {
  const data = { ...input, label: character.repeat(512), value: character.repeat(2048) };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
  expect(inspect({ ...data, label: data.label + character })).toEqual({ status: "invalid_working_shape" });
  expect(inspect({ ...data, value: data.value + character })).toEqual({ status: "invalid_working_shape" });
});
it.each([
  null, [], "private", {}, { ...input, kind: "social" }, { ...input, kind: "generic_link" }, { ...input, kind: "text" },
  ...["email ", "Email", "social", "sms", "telegram", "", 4, false, {}].map(contact_type => ({ ...input, contact_type })),
  ...["kind", "contact_type", "label", "value"].map(field => Object.fromEntries(Object.entries(input).filter(([key]) => key !== field))),
  ...["label", "value"].flatMap(field => [undefined, 42, false, [], {}, "Keep\0private"].map(value => ({ ...input, [field]: value }))),
  ...["owner_id", "block_id", "revision", "destination_url", "href", "country", "normalized", "verified", "safe", "published", "client"]
    .map(field => ({ ...input, [field]: "private-untrusted" })),
])("rejects malformed shapes/selectors without partial output or input erasure %#", data => {
  const before = JSON.stringify(data); expect(inspect(data)).toEqual({ status: "invalid_working_shape" });
  expect(JSON.stringify(data)).toBe(before);
});
it("returns independent data and diagnostics for separate inspections", () => {
  const original = Object.freeze({ ...input, label: "  e\u0301  " }), result = inspect(original);
  if (result.status !== "working") throw new Error("Expected Contact input");
  expect(result.data).not.toBe(original); result.data.value = "Explicit edit";
  result.issues.push({ field: "value", code: "value_required" });
  expect(original.value).toBe(input.value); expect(inspect(original)).toEqual({ status: "working", data: original, issues: [] });
});
it("does not expose a persisted Contact payload or admit it into Link/Text commands", () => {
  const row = { block_id: "11111111-1111-4111-8111-111111111111", kind: "contact", is_visible: false,
    position: 1, payload_state: "not_implemented", link_working: null };
  expect(identityBlockWorkingRowSchema.safeParse(row).success).toBe(true);
  expect(identityBlockWorkingRowSchema.safeParse({ ...row, payload_state: "present" }).success).toBe(false);
  expect(identityBlockWorkingRowSchema.safeParse({ ...row, contact_working: input }).success).toBe(false);
  expect(identityLinkEditorCommandSchema.safeParse({ action: "add_link_block", base_collection_revision: 1,
    is_visible: false, link_working: input }).success).toBe(false);
  expect(identityTextEditorCommandSchema.safeParse({ action: "add_text_block", base_collection_revision: 1,
    is_visible: false, text_working: input }).success).toBe(false);
});
