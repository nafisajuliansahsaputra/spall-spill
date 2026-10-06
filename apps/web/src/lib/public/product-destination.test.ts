import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publishedProductDestinationRequestSchema, validatePublishedProductDestinationResult } from "./product-destination";

const url = "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB";
const request = { handle: "creator", spill_reference: 27, provider_key: "shopee",
  publication_token: "a".repeat(64), destination_hash: createHash("sha256").update(url).digest("hex") };
const result = { status: "success", destination_url: url };
describe("staged server Published Product destination validation", () => {
  it("retains exact affiliate query bytes without rewriting and accepts a canonical locator", () => {
    expect(validatePublishedProductDestinationResult(request, result)).toBe(url);
    expect(publishedProductDestinationRequestSchema.parse({ ...request, handle: "CREATOR" }).handle).toBe("creator");
  });
  it("retains neutral validated provider context and exact original URL", () => {
    const external = "https://store.example.test/item?creator=original";
    expect(validatePublishedProductDestinationResult({ ...request, provider_key: "external:store.example.test",
      destination_hash: createHash("sha256").update(external).digest("hex") }, { status: "success", destination_url: external })).toBe(external);
  });
  it.each([
    null, { status: "unavailable" }, { ...result, safety_reason: "private" },
    { ...result, publication_token: "private" }, { ...result, destination_url: "https://shopee.co.id/new-item" },
    { ...result, destination_url: "https://shopee.co.id/item?affiliate=other&campaign=A%2FB" },
    { ...result, destination_url: "javascript:alert(1)" },
    { ...result, destination_url: "https://foreign.example.test/item" },
  ])("denies unavailable, private, changed or unsafe results %j", (response) => {
    expect(validatePublishedProductDestinationResult(request, response)).toBeNull();
  });
  it.each([
    { ...request, publication_token: null }, { ...request, publication_token: "A".repeat(64) },
    { ...request, destination_hash: "a".repeat(64) }, { ...request, destination_hash: "short" },
    { ...request, provider_key: "tokopedia" }, { ...request, provider_key: "external:127.0.0.1" },
    { ...request, spill_reference: 0 }, { ...request, spill_reference: Number.MAX_SAFE_INTEGER + 1 },
    { ...request, handle: "../creator" }, { ...request, destination_url: url },
    { ...request, owner_id: "private" },
  ])("denies malformed bindings, spoofed providers and private/arbitrary authority %j", (intent) => {
    expect(validatePublishedProductDestinationResult(intent, result)).toBeNull();
  });
});
