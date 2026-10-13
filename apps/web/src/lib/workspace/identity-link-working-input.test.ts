import { afterEach, expect, it, vi } from "vitest";
import { inspectIdentityLinkWorkingInput as inspect } from "./identity-link-working-input";
const generic = { kind: "generic_link", title: "Private label", social_platform: null, destination_url: "https://example.test/path" };
afterEach(() => vi.unstubAllGlobals());
it("checks locally without fetch, input normalization, conversion or public flags", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const data = Object.freeze({ ...generic, title: " <script>literal</script> ", destination_url: "HTTPS://Example.test/Exact?q=%2f" });
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
  expect(fetcher).not.toHaveBeenCalled(); expect(data.destination_url).toBe("HTTPS://Example.test/Exact?q=%2f");
});
it.each([null, "", " ", "\t"])("retains incomplete Generic Link label %j with local issues", title => {
  const data = { ...generic, title }; const result = inspect(data);
  expect(result).toMatchObject({ status: "working", data, issues: expect.arrayContaining([{ field: "title", code: "title_required" }]) });
  expect(data.title).toBe(title);
});
it.each([null, "", " "])("retains incomplete destination %j", destination_url => {
  const data = { ...generic, destination_url };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "destination_url", code: "destination_required" }] });
});
it.each([
  "https://", "javascript:alert(1)", "data:text/html,private", "file:///private", "ftp://example.test/file",
  "https://user:private@example.test", "https://127.0.0.1/path", "https://[::1]/path", "https://localhost/path",
  "https://example.internal/path", "https://home.arpa/path", "https://intranet/path", "https://example.test:8443/path",
  "https://example.test/path#private", " https://example.test/path", "https://example.test/a b",
  "https://example.test/" + String.fromCharCode(9), "https://example.test/" + String.fromCharCode(92),
])("retains invalid/private destination without reflecting policy error %s", destination_url => {
  const data = { ...generic, destination_url };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "destination_url", code: "destination_invalid" }] });
});
it.each([null, "", " "])("requires Social platform without inventing it from destination %j", social_platform => {
  const data = { ...generic, kind: "social", title: null, social_platform };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "social_platform", code: "platform_required" }] });
});
it.each(["Instagram", " instagram", "instagram ", "@instagram", "a.b"])("retains malformed platform %s", social_platform => {
  const data = { ...generic, kind: "social", title: null, social_platform };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "social_platform", code: "platform_invalid" }] });
});
it("uses platform syntax without inventing supported-provider/profile ownership authority", () => {
  const data = { ...generic, kind: "social", title: null, social_platform: "custom_platform-1" };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [] });
});
it("does not clear an inappropriate platform or silently convert Generic Link to Social", () => {
  const data = Object.freeze({ ...generic, social_platform: "instagram" });
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "social_platform", code: "platform_not_applicable" }] });
});
it.each(["social", "generic_link"])("retains title control issue for %s", kind => {
  const data = { ...generic, kind, title: "Label" + String.fromCharCode(127), social_platform: kind === "social" ? "instagram" : null };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "title", code: "title_control_character" }] });
});
it("reports multiple local fields without erasing incomplete Working", () => {
  const data = { kind: "social", title: "tab\t", social_platform: null, destination_url: "javascript:private" };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [
    { field: "title", code: "title_control_character" }, { field: "social_platform", code: "platform_required" },
    { field: "destination_url", code: "destination_invalid" },
  ] });
});
it.each([null, {}, { ...generic, kind: "contact" }, { ...generic, title: 4 }, { ...generic, title: undefined },
  { ...generic, destination_url: undefined }, { ...generic, social_platform: undefined },
  { ...generic, owner_id: "forged" }, { ...generic, block_id: "selector" }, { ...generic, revision: 1 },
  { ...generic, safe: true }, { ...generic, published: true }, { ...generic, provider_key: "instagram" },
  { ...generic, title: "🙂".repeat(513) }, { ...generic, social_platform: "x".repeat(41) },
  { ...generic, destination_url: "🙂".repeat(2049) },
  { ...generic, title: "bad" + String.fromCharCode(0) }, { ...generic, social_platform: String.fromCharCode(0) },
  { ...generic, destination_url: String.fromCharCode(0) },
])("rejects unsafe transport/private shape without mutation %j", data => {
  const before = JSON.stringify(data); expect(inspect(data)).toEqual({ status: "invalid_working_shape" });
  expect(JSON.stringify(data)).toBe(before);
});
it("uses Unicode code-point budgets without claiming long destination readiness", () => {
  const data = { ...generic, title: "🙂".repeat(512), destination_url: "🙂".repeat(2048) };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "destination_url", code: "destination_invalid" }] });
});
it("retains missing onboarding Generic Link label as repairable rather than fabricating one", () => {
  const data = { ...generic, title: null };
  expect(inspect(data)).toEqual({ status: "working", data, issues: [{ field: "title", code: "title_required" }] });
});
