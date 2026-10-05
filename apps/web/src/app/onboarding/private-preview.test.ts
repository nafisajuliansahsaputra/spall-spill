import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { onboardingPreviewFixture, preparedProductPreviewFixture } from "@/test/onboarding-preview-fixture";
import { PrivateOnboardingPreview } from "./private-preview";

describe("private S6 review", () => {
  it("renders acknowledged Identity and responsive review without publication intent", () => {
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview: onboardingPreviewFixture(), profileUrl: null }));
    expect(html).toContain("Private preview"); expect(html).toContain("Preview Owner");
    expect(html).toContain("@preview-owner"); expect(html).toContain("Bio\nSecond line");
    expect(html).toContain("Preview size"); expect(html).toContain("max-w-sm");
    expect(html).not.toContain('type="submit"'); expect(html).not.toContain("snapshot_hash");
  });
  it("escapes Owner text instead of injecting HTML", () => {
    const preview = onboardingPreviewFixture(); preview.identity_working.display_name = "<script>alert(1)</script>";
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview, profileUrl: null }));
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
  it("retains invalid Resource and provides Fix without a clickable source", () => {
    const preview = onboardingPreviewFixture();
    preview.resource_draft = { resource_type: "menu", title: "Saved menu", source_url: "https://example.test/menu", spill_reference: 2, revision: 1,
      safety: { status: "pending", revision: null, expires_at: null }, validation_issues: ["source_not_safe"] };
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview, profileUrl: null }));
    expect(html).toContain("Resource Draft #2"); expect(html).toContain("Saved menu");
    expect(html).toContain("Fix Resource"); expect(html).toContain("Draft will stay saved privately");
    expect(html).not.toContain('href="https://example.test/menu"');
  });
  it("shows Connection safety issue and never follows its external destination", () => {
    const preview = onboardingPreviewFixture(); preview.identity_validation_issues = ["connection_not_safe"];
    preview.connection_working = { connection_kind: "social", social_platform: "instagram", destination_url: "https://example.test/social", revision: 1,
      safety: { status: "blocked", revision: 2, expires_at: "2099-01-01T00:00:00Z" } };
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview, profileUrl: null }));
    expect(html).toContain("Fix social or link"); expect(html).toContain("Safety check needed");
    expect(html).not.toContain('href="https://example.test/social"');
  });
  it("does not silently drop selected unavailable media", () => {
    const preview = onboardingPreviewFixture(); preview.identity_working.profile_asset_key = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    preview.identity_validation_issues = ["profile_media_publication_pending"];
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview, profileUrl: null }));
    expect(html).toContain("Photo preview is temporarily unavailable");
    expect(html).toContain("Publishing this photo is not ready yet");
  });
  it("never calls a title/URL-only Product ready for publication", () => {
    const preview = onboardingPreviewFixture();
    preview.product_draft = { title: "Product title", source_url: "https://example.test/product", revision: 1, spill_reference: 1, preparation: null,
      safety: { status: "safe", revision: 1, expires_at: new Date(Date.now()+60_000).toISOString() },
      validation_issues: ["product_publication_preparation_pending"] };
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview, profileUrl: null }));
    expect(html).toContain("primary-image and marketplace destination preparation");
    expect(html).not.toContain("Ready for your publication review");
  });
  it("renders exact saved Product image and destinations as non-clickable private review", () => {
    const preview = preparedProductPreviewFixture();
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview, profileUrl: null, productImageUrl: "https://storage.test/temporary-preview" }));
    expect(html).toContain('alt="Saved Product primary image"');
    expect(html).toContain("affiliate=creator&amp;campaign=A%2FB");
    expect(html.indexOf("shopee.co.id/item")).toBeLessThan(html.indexOf("shop.example.test/item"));
    expect(html).toContain("Safety checked"); expect(html).toContain("Safety check needed");
    expect(html).toContain("Product publication still needs public delivery and final safety checks");
    expect(html).not.toContain('href="https://'); expect(html).not.toContain("Ready for your publication review");
    expect(html).not.toContain("83000000-0000-4000-8000-000000000001");
  });
  it("retains selected unavailable Product image and the existing Fix path", () => {
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview: preparedProductPreviewFixture(), profileUrl: null }));
    expect(html).toContain("Product image preview is temporarily unavailable");
    expect(html).toContain("saved selection is retained"); expect(html).toContain("Fix Product");
  });
  it("shows incomplete preparation truth without adding a publish button", () => {
    const preview = preparedProductPreviewFixture();
    preview.product_draft!.preparation = { primary_asset_key: null, destinations: [], revision: 1 };
    const html = renderToStaticMarkup(createElement(PrivateOnboardingPreview, { preview, profileUrl: null }));
    expect(html).toContain("Primary image not selected yet"); expect(html).toContain("No marketplace destinations saved yet");
    expect(html).not.toContain('type="submit"');
  });
});
