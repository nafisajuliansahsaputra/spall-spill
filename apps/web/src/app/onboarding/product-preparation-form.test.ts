import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("./product-preparation-actions", () => ({ saveProductPreparationAction: vi.fn() }));
vi.mock("./profile-media-actions", () => ({ initiateProfileMediaUploadAction: vi.fn(), finalizeProfileMediaUploadAction: vi.fn() }));
import { ProductPreparationForm } from "./product-preparation-form";
describe("private Product preparation form", () => {
  it("provides manual image and destination entry with private save truth", () => {
    const html = renderToStaticMarkup(createElement(ProductPreparationForm, {
      preparation: null, productRevision: 2, sourceUrl: "https://shopee.co.id/item?affiliate=creator", previewUrl: null,
    }));
    expect(html).toContain('type="file"'); expect(html).toContain('name="marketplaceDestinations"');
    expect(html).toContain("affiliate=creator"); expect(html).toContain("nothing is published here");
    expect(html).not.toContain("Publish Product"); expect(html).toContain('name="baseProductRevision" value="2"');
  });
  it("retains saved image, ordered destinations and independent revision on reload", () => {
    const html = renderToStaticMarkup(createElement(ProductPreparationForm, {
      productRevision: 2, sourceUrl: "https://unused.test/item", previewUrl: null,
      preparation: { primary_asset_key: "81000000-0000-4000-8000-000000000001", revision: 3,
        destinations: [{ provider_key: "shopee", destination_url: "https://shopee.co.id/item" },
          { provider_key: "tokopedia", destination_url: "https://tokopedia.com/item" }] },
    }));
    expect(html).toContain('name="basePreparationRevision" value="3"');
    expect(html).toContain('value="81000000-0000-4000-8000-000000000001"');
    expect(html.indexOf("https://shopee.co.id/item")).toBeLessThan(html.indexOf("https://tokopedia.com/item"));
    expect(html).not.toContain("https://unused.test/item");
  });
});
