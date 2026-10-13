import { afterEach, expect, it, vi } from "vitest";
import { prepareIdentityConnectionBlockImport } from "./identity-connection-block-import";

const source = { connection_kind: "generic_link", social_platform: null,
  destination_url: "HTTPS://Public.example.test/Exact?X=1", revision: 3 };
const intent = { action: "import_onboarding_connection", source_revision: 3, title: " My Link " };
afterEach(() => vi.restoreAllMocks());
it("prepares only exact source fields, owner title and acknowledged revision without persistence/public authority", () => {
  const original = structuredClone({ source, intent });
  const fetch = vi.spyOn(globalThis, "fetch");
  expect(prepareIdentityConnectionBlockImport(Object.freeze(source), Object.freeze(intent))).toEqual({
    status: "import_candidate", source_connection_revision: 3,
    link_working: { kind: "generic_link", title: " My Link ", social_platform: null, destination_url: source.destination_url }, issues: [],
  });
  expect({ source, intent }).toEqual(original); expect(fetch).not.toHaveBeenCalled();
});
it.each([null, "", " ", "<Private>text", "line\nnext", "nul-free\u007f", "😀".repeat(512)])("retains recoverable owner title %j", title => {
  const result = prepareIdentityConnectionBlockImport(source, { ...intent, title });
  expect(result.status).toBe("import_candidate");
  if (result.status === "import_candidate") {
    expect(result.link_working.title).toBe(title);
    if (title === null || !title.trim()) expect(result.issues).toContainEqual({ field: "title", code: "title_required" });
    if (typeof title === "string" && /[\x00-\x1f\x7f]/.test(title)) expect(result.issues).toContainEqual({ field: "title", code: "title_control_character" });
  }
});
it.each([null, ""])("Social retains kind/platform with optional title %j, no guessed label", title => {
  const result = prepareIdentityConnectionBlockImport({ ...source, connection_kind: "social", social_platform: "custom_platform-1" }, { ...intent, title });
  expect(result).toEqual({ status: "import_candidate", source_connection_revision: 3,
    link_working: { kind: "social", title, social_platform: "custom_platform-1", destination_url: source.destination_url }, issues: [] });
});
it.each(["https://127.0.0.1/private", "https://private.local/path", "https://public.example.test/path#Exact", "https://name:secret@example.test/path", "https://example.test:8443/path"])("preserves source-accepted private raw URL %s with newer local issue", destination_url => {
  expect(prepareIdentityConnectionBlockImport({ ...source, destination_url }, { ...intent, title: null })).toEqual({
    status: "import_candidate", source_connection_revision: 3,
    link_working: { kind: "generic_link", title: null, social_platform: null, destination_url },
    issues: [{ field: "title", code: "title_required" }, { field: "destination_url", code: "destination_invalid" }],
  });
});
it.each([1, Number.MAX_SAFE_INTEGER])("preserves safe source revision boundary %s", revision => {
  const result = prepareIdentityConnectionBlockImport({ ...source, revision }, { ...intent, source_revision: revision });
  expect(result.status).toBe("import_candidate");
  if (result.status === "import_candidate") expect(result.source_connection_revision).toBe(revision);
});
it.each([1, 4, Number.MAX_SAFE_INTEGER])("mismatched acknowledged revision %s returns only stale source", source_revision => {
  expect(prepareIdentityConnectionBlockImport(source, { ...intent, source_revision })).toEqual({ status: "stale_source" });
});
it("missing source is not an empty initialized collection or placeholder block", () => {
  expect(prepareIdentityConnectionBlockImport(null, intent)).toEqual({ status: "no_source" });
});
it.each([undefined, null, {}, "import", { ...intent, action: "auto_import" }, { ...intent, title: undefined },
  { ...intent, title: 1 }, { ...intent, title: "\0" }, { ...intent, title: "😀".repeat(513) },
  ...[null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3"].map(source_revision => ({ ...intent, source_revision })),
])("malformed intent %j has no candidate/private data", value => {
  expect(prepareIdentityConnectionBlockImport(source, value)).toEqual({ status: "invalid_import_intent" });
});
it.each(["owner_id", "block_id", "kind", "social_platform", "destination_url", "is_visible", "position", "collection", "issues", "published", "user_metadata"])("rejects intent-supplied %s authority", field => {
  expect(prepareIdentityConnectionBlockImport(source, { ...intent, [field]: "forged" })).toEqual({ status: "invalid_import_intent" });
});
it.each([undefined, {}, { ...source, connection_kind: "text" }, { ...source, social_platform: "fake" },
  { ...source, connection_kind: "social", social_platform: null },
  { ...source, connection_kind: "social", social_platform: "UPPER" },
  { ...source, destination_url: "javascript:private()" }, { ...source, destination_url: " https://example.test" },
  { ...source, destination_url: "https://example.test\n" },
  ...[null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "3"].map(revision => ({ ...source, revision })),
])("malformed source %j preserves prior 12.81 boundary", value => {
  expect(prepareIdentityConnectionBlockImport(value, intent)).toEqual({ status: "unavailable_source" });
});
it.each(["owner_id", "title", "block_id", "issues", "published", "safe"])("rejects extra source %s without exposing payload", field => {
  expect(prepareIdentityConnectionBlockImport({ ...source, [field]: "forged" }, intent)).toEqual({ status: "unavailable_source" });
});
it("does not bypass explicit intent for absent or malformed source", () => {
  expect(prepareIdentityConnectionBlockImport(null, {})).toEqual({ status: "invalid_import_intent" });
  expect(prepareIdentityConnectionBlockImport({}, {})).toEqual({ status: "invalid_import_intent" });
});
