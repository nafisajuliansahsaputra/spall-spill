import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePublishedResourceServerContext } from "./resource-server-context";
const recognition = { status: "success", current_handle: "renamed", display_name: "Published Owner", spill_reference: 27,
  resource_type: "portfolio", title: "Published Works", available: true, source_url: "https://portfolio.example.test/works?creator=original" };
const binding = { handle: "renamed", spill_reference: 27, publication_token: "a".repeat(64),
  source_hash: createHash("sha256").update(recognition.source_url).digest("hex") };
const context = { status: "success", recognition, binding };
const locator = { handle: "previous", reference: "27" };
describe("private same-snapshot Resource server context", () => {
  it.each(["27", "#27"])("preserves alias-derived canonical context and exact %s bytes without deriving a token", reference => {
    expect(parsePublishedResourceServerContext({ ...locator, reference }, context)).toEqual(context);
  });
  it("retains degraded recognition only with null binding", () => {
    const degraded = { ...context, recognition: { ...recognition, available: false, source_url: null }, binding: null };
    expect(parsePublishedResourceServerContext(locator, degraded)).toEqual(degraded);
  });
  it.each([
    null, { status: "unavailable" }, { ...context, owner_id: "private" },
    { ...context, recognition: { ...recognition, private_revision: 1 } },
    { ...context, recognition: { ...recognition, resource_type: "product" } },
    { ...context, recognition: { ...recognition, spill_reference: 28 } },
    { ...context, binding: { ...binding, handle: "other" } },
    { ...context, binding: { ...binding, spill_reference: 28 } },
    { ...context, binding: { ...binding, publication_token: "short" } },
    { ...context, binding: { ...binding, source_hash: "b".repeat(64) } },
    { ...context, binding: { ...binding, source_url: recognition.source_url } },
    { ...context, binding: null },
    { ...context, recognition: { ...recognition, available: false, source_url: null } },
    { ...context, recognition: { ...recognition, source_url: recognition.source_url.replace("original", "other") } },
    { ...context, recognition: { ...recognition, current_handle: "../private" } },
  ])("rejects malformed/private/stale/cross-context result %j", response => {
    expect(parsePublishedResourceServerContext(locator, response)).toBeNull();
  });
  it.each([
    null, "27", { ...locator, owner_id: "private" }, { ...locator, reference: "027" },
    { ...locator, reference: 27 }, { ...locator, reference: "28" }, { ...locator, publication_token: binding.publication_token },
  ])("denies non-exact/private/mismatched locator %j", input => {
    expect(parsePublishedResourceServerContext(input, context)).toBeNull();
  });
  it("denies hostile response getters without exposing their reason", () => {
    expect(parsePublishedResourceServerContext(locator, { status: "success", get recognition() { throw new Error("private reason"); } })).toBeNull();
  });
  it("retains frozen input and response", () => {
    Object.freeze(recognition); Object.freeze(binding); Object.freeze(context); Object.freeze(locator);
    expect(parsePublishedResourceServerContext(locator, context)).toEqual(context);
  });
});
