import { describe, expect, it } from "vitest";
import { marketplaceProvider, productDestinationsSchema, productPreparationSuccessSchema } from "./product-preparation-contract";

describe("private marketplace preparation", () => {
  it.each([
    ["https://shopee.co.id/item?affiliate=creator", "shopee"],
    ["https://s.shopee.co.id/item", "shopee"], ["https://shope.ee/abc", "shopee"],
    ["https://www.tokopedia.com/item", "tokopedia"], ["https://tokopedia.link/item", "tokopedia"],
    ["https://vt.tiktok.com/item", "tiktok"],
    ["https://shopee.co.id.attacker.test/item", "external:shopee.co.id.attacker.test"],
    ["https://notshopee.co.id/item", "external:notshopee.co.id"],
    ["https://shop.example.com/item", "external:shop.example.com"],
  ])("recognizes only validated host context for %s", (url, provider) => expect(marketplaceProvider(url)).toBe(provider));
  it.each(["javascript:alert(1)", "https://user:password@example.com/item", "http://127.0.0.1/item",
    "https://localhost/item", "https://host.internal/item", "https://example.com:3000/item",
    "https://example.com/item#fragment", "https://example.com./item", "https://example.com/a b"])(
    "rejects unsafe preparation %s", (url) => expect(marketplaceProvider(url)).toBeNull());
  it("rejects duplicate marketplaces even when the URLs differ", () => {
    expect(productDestinationsSchema.safeParse([
      { provider_key: "shopee", destination_url: "https://shopee.co.id/item" },
      { provider_key: "shopee", destination_url: "https://shope.ee/other" },
    ]).success).toBe(false);
  });
  it("rejects provider spoofing and arbitrary fields", () => {
    expect(productDestinationsSchema.safeParse([{ provider_key: "shopee", destination_url: "https://example.com/item" }]).success).toBe(false);
    expect(productDestinationsSchema.safeParse([{ provider_key: "shopee", destination_url: "https://shopee.co.id/item", safe: true }]).success).toBe(false);
  });
  it("allows incomplete private preparation but no authority fields in acknowledgment", () => {
    const result = { status: "success", current_step: "relevant_first_job", product_revision: 1,
      preparation: { primary_asset_key: null, destinations: [], revision: 1 } };
    expect(productPreparationSuccessSchema.safeParse(result).success).toBe(true);
    expect(productPreparationSuccessSchema.safeParse({ ...result, owner_id: "forged" }).success).toBe(false);
    expect(productPreparationSuccessSchema.safeParse({ ...result, product_revision: null }).success).toBe(false);
  });
});
