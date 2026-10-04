import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { onboardingPreviewFixture } from "@/test/onboarding-preview-fixture";
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
});
