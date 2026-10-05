import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublishedProductConfirmation } from "./product-confirmation";

const product = {
  status: "success", current_handle: "creator", display_name: "Published Creator", spill_reference: 27,
  title: "Published Product", primary_image_path: "/media/product/creator/27",
  destinations: [
    { provider_key: "shopee", available: true, destination_url: "https://shopee.co.id/item?affiliate=creator" },
    { provider_key: "tokopedia", available: true, destination_url: "https://tokopedia.com/item" },
  ],
};
const render = (payload: unknown) => renderToStaticMarkup(createElement(PublishedProductConfirmation, { payload }));

describe("staged Published Product confirmation", () => {
  it("orients direct entry with Published Owner/reference, selected image and title in recognition order", () => {
    const html = render(product);
    expect(html).toContain('aria-label="Product confirmation"');
    expect(html).toContain('href="/creator"');
    expect(html).toContain("Published Creator");
    expect(html).toContain("@creator");
    expect(html).toContain('href="/creator/spill"');
    expect(html).toContain("Browse Spill");
    expect(html).toContain('src="/media/product/creator/27"');
    expect(html).toContain('alt="Published Product"');
    expect(html.indexOf("Product #27")).toBeLessThan(html.indexOf("<img"));
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<h1"));
    expect(html).not.toContain("/_next/image");
    expect(html).not.toContain("srcSet=");
  });
  it("escapes Owner text without injecting markup or attributes", () => {
    const html = render({ ...product, display_name: '<script>alert("owner")</script>', title: '<img src=x onerror="alert(1)">' });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('onerror="');
  });
  it.each([1, 2])("emits no outbound actions/URLs for %i safe destination(s)", (count) => {
    const html = render({ ...product, destinations: product.destinations.slice(0, count) });
    expect(html).not.toContain("https://");
    expect(html).not.toContain("affiliate=");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("login");
  });
  it("retains identical recognition when only an alternative destination degrades", () => {
    const partial = { ...product, destinations: [product.destinations[0], { provider_key: "tokopedia", available: false, destination_url: null }] };
    expect(render(partial)).toBe(render(product));
  });
  it("retains all Published recognition and safe navigation when commerce becomes unavailable without mutating input", () => {
    const unavailable = { ...product, destinations: product.destinations.map((d) => ({ ...d, available: false, destination_url: null })) };
    const before = JSON.stringify(unavailable);
    const html = render(unavailable);
    expect(html).toContain("Published Product");
    expect(html).toContain("Published Creator");
    expect(html).toContain("Product #27");
    expect(html).toContain('src="/media/product/creator/27"');
    expect(html).toContain("Browse Spill");
    expect(html).toContain("Marketplace destinations are temporarily unavailable.");
    expect(html).not.toContain("<button");
    expect(JSON.stringify(unavailable)).toBe(before);
  });
  it("omits absent optional metadata rather than inventing placeholders or commerce claims", () => {
    const html = render(product);
    for (const text of ["description", "brand", "category", "price", "stock", "cheapest", "best seller", "No description"]) {
      expect(html).not.toContain(text);
    }
  });
  it.each([
    null, { status: "unavailable" }, { status: "unavailable", reason: "hidden" },
    { ...product, working_title: "Private Working title" },
    { ...product, primary_image_path: "/media/product/other/27" },
    { ...product, primary_image_path: "https://private-storage.test/asset?signature=secret" },
    { ...product, current_handle: "creator/../../private" },
  ])("returns the same generic denial for malformed/private/unavailable input %j", (payload) => {
    const html = render(payload);
    expect(html).toBe(render({ status: "unavailable" }));
    expect(html).toContain("This item is not available.");
    for (const text of ["Published Creator", "Published Product", "#27", "<img", "<a", "private", "hidden", "secret"]) {
      expect(html).not.toContain(text);
    }
  });
});
