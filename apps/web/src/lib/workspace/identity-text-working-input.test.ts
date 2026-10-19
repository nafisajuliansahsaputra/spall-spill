import { afterEach, expect, it, vi } from "vitest";
import { inspectIdentityTextWorkingInput as inspect } from "./identity-text-working-input";
import { identityBlockWorkingRowSchema } from "./owner-blocks-working";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";

afterEach(() => vi.unstubAllGlobals());
it.each([null, "", " ", "\t\r\n", "\u00a0", "\u3000"])("keeps unfinished text %j recoverable", text => {
  const data = Object.freeze({ kind: "text", text });
  expect(inspect(data)).toEqual({ status: "working", data,
    issues: [{ field: "text", code: "text_required" }] });
});
it.each([
  "  Catatan pribadi  ", "First line\r\nSecond\tline\nLast\r", "Bahasa Indonesia — 日本語 🙂",
  "e\u0301 is distinct from é", "**literal Markdown** [label](javascript:private)",
  '<script>globalThis.privateTextExecuted = true</script>',
  '<img src="https://private.example/image" onerror="privateCode()">',
  "<style>body{display:none}</style>", "javascript:alert(1)",
  "https://127.0.0.1/private", "mailto:owner@example.test", "+62 812 3456 7890",
])("retains literal content without interpretation, link conversion or fetch %j", text => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const data = Object.freeze({ kind: "text", text });
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
  expect(fetcher).not.toHaveBeenCalled();
  expect(Object.hasOwn(globalThis, "privateTextExecuted")).toBe(false);
});
it.each([1, 8, 11, 12, 14, 27, 31, 127])("retains control U+%i with a fixed issue", code => {
  const data = { kind: "text", text: `Keep${String.fromCharCode(code)}this` };
  expect(inspect(data)).toEqual({ status: "working", data,
    issues: [{ field: "text", code: "text_control_character" }] });
});
it("returns independent data without changing the original work or sharing result state", () => {
  const original = Object.freeze({ kind: "text", text: "  e\u0301\r\n🙂  " });
  const result = inspect(original);
  expect(result.status).toBe("working");
  if (result.status !== "working") throw new Error("Expected recoverable work");
  expect(result.data).not.toBe(original);
  result.data.text = "Explicit local edit";
  result.issues.push({ field: "text", code: "text_required" });
  expect(original.text).toBe("  e\u0301\r\n🙂  ");
  expect(inspect(original)).toEqual({ status: "working", data: original, issues: [] });
});
it.each(["a", "🙂"])("counts the engineering envelope in code points for %s", character => {
  const text = character.repeat(16384);
  expect(inspect({ kind: "text", text })).toEqual({ status: "working", data: { kind: "text", text }, issues: [] });
  expect(inspect({ kind: "text", text: text + character })).toEqual({ status: "invalid_working_shape" });
});
it.each([
  null, {}, [], "private", { text: "Private" }, { kind: "text" },
  { kind: "text", text: undefined }, { kind: "text", text: 42 }, { kind: "text", text: false },
  { kind: "text", text: ["Private"] }, { kind: "text", text: { toString: () => "Private" } },
  { kind: "generic_link", text: "Private" }, { kind: "contact", text: "Private" },
  { kind: "text", text: "Keep" + String.fromCharCode(0) + "private" },
  ...["owner_id", "block_id", "revision", "html", "format", "destination_url", "safe", "published", "permission", "client"]
    .map(field => ({ kind: "text", text: "Private", [field]: "untrusted" })),
])("rejects selectors, formats and malformed envelopes without erasure %#", data => {
  const before = JSON.stringify(data);
  expect(inspect(data)).toEqual({ status: "invalid_working_shape" });
  expect(JSON.stringify(data)).toBe(before);
});
it("does not make Text accepted by the existing link editor command boundary", () => {
  const text = { kind: "text", text: "Private" };
  expect(inspect(text).status).toBe("working");
  const command = { action: "add_link_block", base_collection_revision: 1, is_visible: true,
    link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } };
  expect(identityLinkEditorCommandSchema.safeParse(command).success).toBe(true);
  expect(identityLinkEditorCommandSchema.safeParse({ ...command, link_working: text }).success).toBe(false);
});
it("keeps persisted Text truth at not_implemented without accepting a fabricated payload", () => {
  const row = { block_id: "11111111-1111-4111-8111-111111111111", kind: "text",
    is_visible: false, position: 1, payload_state: "not_implemented", link_working: null };
  expect(identityBlockWorkingRowSchema.safeParse(row).success).toBe(true);
  expect(identityBlockWorkingRowSchema.safeParse({ ...row, payload_state: "present" }).success).toBe(false);
  expect(identityBlockWorkingRowSchema.safeParse({ ...row, text_working: { kind: "text", text: "Private" } }).success).toBe(false);
});
