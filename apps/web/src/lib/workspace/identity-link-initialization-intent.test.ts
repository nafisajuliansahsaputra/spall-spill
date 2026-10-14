import { afterEach, expect, it, vi } from "vitest";
import { identityLinkInitializationIntentSchema, inspectIdentityLinkInitializationIntent as inspect } from "./identity-link-initialization-intent";

const link = { kind: "generic_link", title: "Private label", social_platform: null, destination_url: "https://example.test/path" };
const intent = { action: "initialize_link_block", base_collection_revision: null, is_visible: true, link_working: link };
afterEach(() => vi.unstubAllGlobals());

it.each(["social", "generic_link"])("retains explicit %s and visibility with no allocation or public acknowledgment", kind => {
  for (const is_visible of [true, false]) {
    const data = { ...intent, is_visible, link_working: { ...link, kind, social_platform: kind === "social" ? "custom_platform-1" : null } };
    expect(identityLinkInitializationIntentSchema.parse(data)).toEqual(data);
    expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  }
});
it("requires explicit null expected-absence intent without claiming an empty collection or revision", () => {
  expect(inspect(intent)).toEqual({ status: "intent", data: intent, issues: [] });
  expect(inspect({ ...intent, base_collection_revision: 1 })).toEqual({ status: "invalid_initialization_intent" });
});
it("keeps raw markup/case/whitespace immutable and never fetches or allocates IDs", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const uuid = vi.fn(() => { throw new Error("no allocation"); }); vi.stubGlobal("crypto", { randomUUID: uuid });
  const data = Object.freeze({ ...intent, link_working: Object.freeze({ ...link,
    title: " <script>literal</script> ", destination_url: "HTTPS://Example.test/Exact?q=%2f" }) });
  const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [] });
  expect(data).toEqual(before); expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
});
it.each([null, "", " "])("retains incomplete raw fields %j and local repair issues", value => {
  const data = { ...intent, link_working: { kind: "social", title: value, social_platform: value, destination_url: value } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [
    { field: "social_platform", code: "platform_required" }, { field: "destination_url", code: "destination_required" },
  ] });
});
it("retains invalid Working and exact fixed multiple issues without conversion or source import", () => {
  const data = { ...intent, link_working: { ...link, title: "\t", social_platform: "instagram", destination_url: "javascript:private" } };
  const before = structuredClone(data);
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [
    { field: "title", code: "title_required" }, { field: "title", code: "title_control_character" },
    { field: "social_platform", code: "platform_not_applicable" }, { field: "destination_url", code: "destination_invalid" },
  ] });
  expect(data).toEqual(before);
});
it.each(["https://", "javascript:private", "https://user:private@example.test", "https://127.0.0.1/path", "https://example.test:8443/path"])("retains unsafe URL %s as repairable intent without opening it", destination_url => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const data = { ...intent, link_working: { ...link, destination_url } };
  expect(inspect(data)).toEqual({ status: "intent", data, issues: [{ field: "destination_url", code: "destination_invalid" }] });
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([null, undefined, [], {}, "add_link_block",
  ...[null, undefined, "", "initialize_link_block ", "add_link_block", "import_onboarding_connection", "save", true].map(action => ({ ...intent, action })),
  ...[undefined, 0, 1, -1, 1.5, "1", "null", {}, NaN, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1].map(base_collection_revision => ({ ...intent, base_collection_revision })),
  ...[null, undefined, 0, 1, "true", "false", {}, []].map(is_visible => ({ ...intent, is_visible })),
  ...[null, undefined, [], {}, "link"].map(link_working => ({ ...intent, link_working })),
])("rejects malformed/coerced outer envelope without mutation %j", value => {
  const before = structuredClone(value); expect(inspect(value)).toEqual({ status: "invalid_initialization_intent" }); expect(value).toEqual(before);
});
it.each(["action", "base_collection_revision", "is_visible", "link_working"])("never defaults missing %s", field => {
  const value = Object.fromEntries(Object.entries(intent).filter(([key]) => key !== field));
  expect(inspect(value)).toEqual({ status: "invalid_initialization_intent" });
});
it.each(["owner_id", "block_id", "position", "neighbor_block_id", "block_ids", "source_revision", "provenance", "collection_revision", "published", "safe", "operation_id", "issues", "created_at"])("rejects outer caller authority %s", field => {
  const value = { ...intent, [field]: "private-forged" }; const before = structuredClone(value);
  expect(inspect(value)).toEqual({ status: "invalid_initialization_intent" }); expect(value).toEqual(before);
});
it.each(["owner_id", "block_id", "position", "source", "issues", "safe", "provider_key", "published"])("rejects nested caller authority %s", field => {
  expect(inspect({ ...intent, link_working: { ...link, [field]: "private-forged" } })).toEqual({ status: "invalid_initialization_intent" });
});
it.each(["kind", "title", "social_platform", "destination_url"])("requires explicit nested %s without guessing", field => {
  expect(inspect({ ...intent, link_working: Object.fromEntries(Object.entries(link).filter(([key]) => key !== field)) })).toEqual({ status: "invalid_initialization_intent" });
});
it.each(["contact", "media", "text", "spill_cta", "Social", "generic_link "])("does not invent typed payload for %s in this bounded parser", kind => {
  expect(inspect({ ...intent, link_working: { ...link, kind } })).toEqual({ status: "invalid_initialization_intent" });
});
it.each([["title", 512], ["social_platform", 40], ["destination_url", 2048]] as const)("preserves Unicode budget for %s and rejects excess/NUL/wrong type without erasure", (field, limit) => {
  const value = { ...intent, link_working: { ...link, [field]: "🙂".repeat(limit) } };
  expect(inspect(value)).toMatchObject({ status: "intent", data: value });
  for (const raw of ["🙂".repeat(limit + 1), "private\u0000", 42, undefined]) {
    const invalid = { ...intent, link_working: { ...link, [field]: raw } }; const before = structuredClone(invalid);
    expect(inspect(invalid)).toEqual({ status: "invalid_initialization_intent" }); expect(invalid).toEqual(before);
  }
});
