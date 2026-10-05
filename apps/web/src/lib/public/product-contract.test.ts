import { describe, expect, it } from "vitest";
import { publicProductPayloadSchema } from "./product-contract";

const product = {
  status: "success", current_handle: "creator", display_name: "Published Creator", spill_reference: 27,
  title: "Published Product", primary_image_path: "/media/product/creator/27",
  destinations: [
    { provider_key: "shopee", available: true, destination_url: "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB" },
    { provider_key: "external:store.example.test", available: false, destination_url: null },
  ],
};
describe("staged public Product DTO", () => {
  it("accepts ordered exact attribution and retains a degraded alternative without its URL", () => {
    expect(publicProductPayloadSchema.parse(product)).toEqual(product);
  });
  it("retains Published context when every destination is unavailable", () => {
    const degraded = { ...product, destinations: product.destinations.map((d) => ({ ...d, available: false, destination_url: null })) };
    expect(publicProductPayloadSchema.parse(degraded)).toEqual(degraded);
  });
  it("accepts only uniform unavailable without private reasons", () => {
    expect(publicProductPayloadSchema.parse({ status: "unavailable" })).toEqual({ status: "unavailable" });
    expect(publicProductPayloadSchema.safeParse({ status: "unavailable", reason: "hidden" }).success).toBe(false);
  });
  it.each([
    { ...product, owner_id: "private" }, { ...product, primary_asset_key: "private" },
    { ...product, preparation_revision: 2 }, { ...product, publication_token: "private" },
    { ...product, primary_image_path: "https://private-storage.test/image?signature=secret" },
    { ...product, primary_image_path: "/media/product/other/27" },
    { ...product, primary_image_path: "/media/product/creator/28" },
    { ...product, spill_reference: Number.MAX_SAFE_INTEGER + 1 }, { ...product, spill_reference: 0 },
    { ...product, title: " " }, { ...product, display_name: " " }, { ...product, destinations: [] },
    { ...product, destinations: [product.destinations[0], product.destinations[0]] },
    { ...product, destinations: [{ provider_key: "shopee", available: true, destination_url: "https://foreign.example.test/item" }] },
    { ...product, destinations: [{ provider_key: "shopee", available: false, destination_url: "https://shopee.co.id/item" }] },
    { ...product, destinations: [{ provider_key: "shopee", available: true, destination_url: null }] },
    { ...product, destinations: [{ provider_key: "external:127.0.0.1", available: false, destination_url: null }] },
    { ...product, destinations: [{ provider_key: "external:shopee.co.id", available: false, destination_url: null }] },
    { ...product, destinations: [{ provider_key: "shopee", available: true, destination_url: "javascript:alert(1)" }] },
    { ...product, destinations: [{ ...product.destinations[0], scanner_reason: "private" }] },
  ])("rejects unsafe/inconsistent/private projection %j", (payload) => {
    expect(publicProductPayloadSchema.safeParse(payload).success).toBe(false);
  });
});
