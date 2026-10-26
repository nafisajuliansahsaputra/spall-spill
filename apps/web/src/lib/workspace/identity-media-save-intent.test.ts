import { afterEach, expect, it, vi } from "vitest";
import { identityMediaSaveIntentSchema, inspectIdentityMediaSaveIntent as inspect } from "./identity-media-save-intent";
import { identityContactSaveIntentSchema } from "./identity-contact-save-intent";
import { identityTextSaveIntentSchema } from "./identity-text-save-intent";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";

const id = "a2800000-0000-4000-8000-000000000011";
const asset = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const working = { kind: "media", asset_key: asset, alt_text: "Private" };
const intent = { block_id: id, base_collection_revision: 1, media_working: working };
afterEach(() => vi.unstubAllGlobals());

it.each([1, Number.MAX_SAFE_INTEGER])("preserves explicit target/base %i without existence or Owner proof", base_collection_revision => {
  const data = { ...intent, base_collection_revision };
  expect(identityMediaSaveIntentSchema.parse(data)).toEqual(data);
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
});
it.each([null, "", " ", "\u3000", "Keep\t\r\n", "Keep\u007f"])("retains nullable/raw alt with fixed diagnostics %#", alt_text => {
  const data = { ...intent, media_working: { kind: "media", asset_key: null, alt_text } };
  const issues = [{ field: "asset_key", code: "asset_required" }];
  if (alt_text === "Keep\t\r\n" || alt_text === "Keep\u007f") issues.push({ field: "alt_text", code: "alt_text_control_character" });
  expect(inspect(data)).toEqual({ status: "intent", data, issues });
});
it.each([asset, asset.toUpperCase()])("retains asset syntax %s without normalization or canonical selection proof", asset_key => {
  const data = { ...intent, media_working: { ...working, asset_key } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
});
it.each([" e\u0301 é 🙂 ", '<script>globalThis.privateMediaExecuted=true</script>',
  '<img src="https://private.example" onerror="privateCode()">', "javascript:private()", "https://127.0.0.1/private",
])("keeps literal content without fetch/execution/allocation %#", alt_text => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const allocator = vi.fn(); vi.stubGlobal("crypto", { randomUUID: allocator });
  const data = Object.freeze({ ...intent, media_working: Object.freeze({ ...working, alt_text }) });
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(fetcher).not.toHaveBeenCalled(); expect(allocator).not.toHaveBeenCalled();
  expect(Object.hasOwn(globalThis, "privateMediaExecuted")).toBe(false);
});
it.each([null, undefined, [], {}, "", "../other", id.toUpperCase(), ` ${id}`, `${id}\n`, `urn:uuid:${id}`])(
  "rejects malformed/noncanonical block selector without erasure %#", block_id => {
    const data = { ...intent, block_id }; const before = structuredClone(data);
    expect(inspect(data)).toEqual({ status: "invalid_save_intent" }); expect(data).toEqual(before);
  });
it.each([null, undefined, 0, -1, 1.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe/coerced revision %#", base_collection_revision => {
  expect(inspect({ ...intent, base_collection_revision })).toEqual({ status: "invalid_save_intent" });
});
it.each(["block_id", "base_collection_revision", "media_working"])("never defaults missing outer %s", field => {
  expect(inspect(Object.fromEntries(Object.entries(intent).filter(([key]) => key !== field)))).toEqual({ status: "invalid_save_intent" });
});
it.each(["kind", "asset_key", "alt_text"])("requires explicit nested %s", field => {
  expect(inspect({ ...intent, media_working: Object.fromEntries(Object.entries(working).filter(([key]) => key !== field)) })).toEqual({ status: "invalid_save_intent" });
});
it.each(["owner_id", "action", "is_visible", "position", "neighbor_block_id", "provenance", "source_revision", "collection_revision",
  "operation_id", "published", "safe", "issues", "asset_state", "metadata", "client", "object_key", "destination_url"])("denies outer authority %s", field => {
  const data = { ...intent, [field]: "untrusted" }; const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "invalid_save_intent" }); expect(data).toEqual(before);
});
it.each(["owner_id", "block_id", "base_collection_revision", "is_visible", "source", "issues", "safe", "asset_state", "object_key",
  "url", "metadata", "width", "provider_key", "published", "decorative", "destination_url"])("denies nested authority %s", field => {
  expect(inspect({ ...intent, media_working: { ...working, [field]: "untrusted" } })).toEqual({ status: "invalid_save_intent" });
});
it.each([null, undefined, [], {}, "save_media", { ...intent, media_working: null }, { ...intent, media_working: [] },
  ...["social", "generic_link", "text", "contact", "spill_cta", "Media", "media ", null].map(kind => ({ ...intent, media_working: { ...working, kind } })),
  ...[undefined, 42, false, [], {}, "", "https://private.example/image", `working/profile/${asset}.webp`, "data:image/png;base64,private"]
    .map(asset_key => ({ ...intent, media_working: { ...working, asset_key } })),
  ...[undefined, 42, false, [], {}, "raw\u0000", "🙂".repeat(2049)].map(alt_text => ({ ...intent, media_working: { ...working, alt_text } })),
])("denies malformed envelopes/raw field shapes without partial coercion %#", value => {
  const before = structuredClone(value); expect(inspect(value)).toEqual({ status: "invalid_save_intent" }); expect(value).toEqual(before);
});
it.each(["a", "🙂"])("counts engineering envelope in code points for %s", char => {
  const data = { ...intent, media_working: { ...working, alt_text: char.repeat(2048) } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(inspect({ ...data, media_working: { ...data.media_working, alt_text: data.media_working.alt_text + char } })).toEqual({ status: "invalid_save_intent" });
});
it("isolates copies and diagnostics between invocations without mutating frozen work", () => {
  const data = Object.freeze({ ...intent, media_working: Object.freeze({ kind: "media", asset_key: null, alt_text: "\t" }) });
  const result = inspect(data); if (result.status !== "intent") throw new Error("Expected intent");
  expect(result.data).not.toBe(data); expect(result.data.media_working).not.toBe(data.media_working);
  result.data.media_working.asset_key = asset; result.data.base_collection_revision = 9; result.issues.length = 0;
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [
    { field: "asset_key", code: "asset_required" }, { field: "alt_text", code: "alt_text_control_character" }] });
  expect(data.media_working.asset_key).toBeNull(); expect(data.base_collection_revision).toBe(1);
});
it("keeps Media save separate from existing Contact/Text/Link commands", () => {
  expect(inspect(intent).status).toBe("intent");
  for (const schema of [identityContactSaveIntentSchema, identityTextSaveIntentSchema, identityLinkEditorCommandSchema]) {
    expect(schema.safeParse(intent).success).toBe(false);
  }
  const contact = { block_id: id, base_collection_revision: 1, contact_working: { kind: "contact", contact_type: null, label: null, value: null } };
  expect(identityContactSaveIntentSchema.safeParse(contact).success).toBe(true); expect(inspect(contact)).toEqual({ status: "invalid_save_intent" });
});
