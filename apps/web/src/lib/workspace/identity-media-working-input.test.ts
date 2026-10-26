import { afterEach, expect, it, vi } from "vitest";
import { inspectIdentityMediaWorkingInput as inspect } from "./identity-media-working-input";
import { identityBlockWorkingRowSchema } from "./owner-blocks-working";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";

const asset_key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
afterEach(() => vi.unstubAllGlobals());

it.each([null, "", " ", "\u00a0", "\u3000"])("preserves unfinished alt text %j without deciding decorative policy", alt_text => {
  const data = Object.freeze({ kind: "media", asset_key: null, alt_text });
  expect(inspect(data)).toEqual({ status: "working", data,
    issues: [{ field: "asset_key", code: "asset_required" }] });
  expect(inspect({ ...data, asset_key })).toEqual({ status: "working", data: { ...data, asset_key }, issues: [] });
});
it.each([
  "  Brand expression  ", "Bahasa Indonesia — 日本語 🙂", "e\u0301 ≠ é",
  "**literal Markdown** [label](javascript:private)",
  '<script>globalThis.privateMediaExecuted = true</script>',
  '<img src="https://private.example/image" onerror="privateCode()">',
  "javascript:alert(1)", "https://127.0.0.1/private", "data:image/svg+xml,<svg/>",
])("retains raw accessibility text without interpretation or I/O %j", alt_text => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const data = Object.freeze({ kind: "media", asset_key, alt_text });
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
  expect(fetcher).not.toHaveBeenCalled();
  expect(Object.hasOwn(globalThis, "privateMediaExecuted")).toBe(false);
});
it.each(Array.from({ length: 31 }, (_, index) => index + 1).concat(127))(
  "retains ASCII control U+%i with a fixed local diagnostic", code => {
    const data = { kind: "media", asset_key, alt_text: `Keep${String.fromCharCode(code)}this` };
    expect(inspect(data)).toEqual({ status: "working", data,
      issues: [{ field: "alt_text", code: "alt_text_control_character" }] });
  });
it("orders diagnostics without echoing private input", () => {
  const data = { kind: "media", asset_key: null, alt_text: "Private\r\n\ttext" };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [
    { field: "asset_key", code: "asset_required" },
    { field: "alt_text", code: "alt_text_control_character" },
  ] });
});
it.each([asset_key, asset_key.toUpperCase()])("keeps UUID syntax separate from asset existence/Owner authority %s", key => {
  const data = { kind: "media", asset_key: key, alt_text: "Private" };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
});
it.each(["a", "🙂"])("counts the local envelope in Unicode code points for %s", char => {
  const data = { kind: "media", asset_key, alt_text: char.repeat(2048) };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
  expect(inspect({ ...data, alt_text: data.alt_text + char })).toEqual({ status: "invalid_working_shape" });
});
it("copies work independently without erasing input or sharing diagnostic state", () => {
  const data = Object.freeze({ kind: "media", asset_key: null, alt_text: " e\u0301\r\n🙂 " });
  const result = inspect(data);
  if (result.status !== "working") throw new Error("Expected recoverable work");
  expect(result.data).not.toBe(data);
  result.data.asset_key = asset_key; result.data.alt_text = "Explicit edit"; result.issues.length = 0;
  expect(inspect(data)).toEqual({ status: "working", data, issues: [
    { field: "asset_key", code: "asset_required" },
    { field: "alt_text", code: "alt_text_control_character" },
  ] });
});
it.each([
  null, {}, [], "private", { kind: "media" }, { asset_key, alt_text: null },
  { kind: "image", asset_key, alt_text: null }, { kind: "media", asset_key },
  { kind: "media", alt_text: null },
  ...[undefined, false, 42, [], {}, "", ` ${asset_key}`, `${asset_key} `,
    "not-a-uuid", "https://private.example/image?signature=private", `working/profile/${asset_key}.webp`,
    "data:image/png;base64,private"].map(key => ({ kind: "media", asset_key: key, alt_text: null })),
  ...[undefined, false, 42, [], {}, "Keep\u0000private"].map(alt_text => ({ kind: "media", asset_key, alt_text })),
  ...["owner_id", "block_id", "revision", "object_key", "url", "destination_url", "decorative",
    "width", "mime", "html", "published", "safe", "sanitized", "permission", "client"]
    .map(field => ({ kind: "media", asset_key, alt_text: null, [field]: "untrusted" })),
])("rejects malformed shapes and authority/transport fields without partial coercion %#", value => {
  const before = JSON.stringify(value);
  expect(inspect(value)).toEqual({ status: "invalid_working_shape" });
  expect(JSON.stringify(value)).toBe(before);
});
it("keeps Media unavailable to the existing persisted decoder and Link command", () => {
  const media = { kind: "media", asset_key, alt_text: "Private" };
  expect(inspect(media).status).toBe("working");
  const row = { block_id: "11111111-1111-4111-8111-111111111111", kind: "media",
    is_visible: false, position: 1, payload_state: "not_implemented", link_working: null };
  expect(identityBlockWorkingRowSchema.safeParse(row).success).toBe(true);
  expect(identityBlockWorkingRowSchema.safeParse({ ...row, payload_state: "present" }).success).toBe(false);
  expect(identityBlockWorkingRowSchema.safeParse({ ...row, media_working: media }).success).toBe(false);
  const command = { action: "add_link_block", base_collection_revision: 1, is_visible: true,
    link_working: { kind: "generic_link", title: null, social_platform: null, destination_url: null } };
  expect(identityLinkEditorCommandSchema.safeParse(command).success).toBe(true);
  expect(identityLinkEditorCommandSchema.safeParse({ ...command, link_working: media }).success).toBe(false);
});
