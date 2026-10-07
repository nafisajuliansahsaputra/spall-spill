import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publishedResourceSourceRequestSchema, validatePublishedResourceSourceResult } from "./resource-source";
const url = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const request = { handle: "creator", spill_reference: 27, publication_token: "a".repeat(64), source_hash: hash(url) };
const result = { status: "success", source_url: url };
describe("staged exact Published Resource source validation", () => {
  it("preserves original attribution bytes and canonicalizes only the Handle locator", () => {
    expect(validatePublishedResourceSourceResult(request, result)).toBe(url);
    expect(publishedResourceSourceRequestSchema.parse({ ...request, handle: "CREATOR" }).handle).toBe("creator");
  });
  it("preserves bounded canonical HTTP source without inferring semantic type or provider", () => {
    const source = "http://document.example.test/file?creator=original";
    expect(validatePublishedResourceSourceResult({ ...request, source_hash: hash(source) }, { ...result, source_url: source })).toBe(source);
  });
  it.each([
    null, { status: "unavailable" }, { ...result, safety_reason: "private" },
    { ...result, publication_token: "private" }, { ...result, owner_id: "private" },
    { ...result, source_url: url.replace("original", "other") }, { ...result, source_url: url.replace("%2F", "%2f") },
    { ...result, source_url: "https://foreign.example.test/" }, { ...result, source_url: null },
  ])("denies unavailable/private/changed response %j", response => {
    expect(validatePublishedResourceSourceResult(request, response)).toBeNull();
  });
  it.each([
    "javascript:alert(1)", "https://127.0.0.1/", "https://localhost/", "https://user:password@example.test/",
    "https://PORTFOLIO.example.test/", " https://portfolio.example.test/", "https://portfolio.example.test/a b",
    "https://portfolio.example.test/a\\b", "https://portfolio.example.test/a\nb",
  ])("rejects unsafe/noncanonical source %s even with matching bytes", source => {
    expect(validatePublishedResourceSourceResult({ ...request, source_hash: hash(source) }, { ...result, source_url: source })).toBeNull();
  });
  it.each([
    null, { ...request, publication_token: null }, { ...request, publication_token: "A".repeat(64) },
    { ...request, source_hash: "a".repeat(64) }, { ...request, source_hash: "short" },
    { ...request, spill_reference: 0 }, { ...request, spill_reference: Number.MAX_SAFE_INTEGER + 1 },
    { ...request, handle: "../creator" }, { ...request, source_url: url },
    { ...request, owner_id: "private" }, { ...request, resource_type: "portfolio" },
    { ...request, provider_key: "external:portfolio.example.test" },
  ])("rejects malformed/private/arbitrary request authority %j", binding => {
    expect(validatePublishedResourceSourceResult(binding, result)).toBeNull();
  });
  it("does not mutate bindings or results", () => {
    const frozenRequest = Object.freeze({ ...request }); const frozenResult = Object.freeze({ ...result });
    expect(validatePublishedResourceSourceResult(frozenRequest, frozenResult)).toBe(url);
    expect(frozenRequest).toEqual(request); expect(frozenResult).toEqual(result);
  });
});
