import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  advanceRelevantFirstJobAction: vi.fn(),
  saveIdentityConnectionAction: vi.fn(),
  saveProductDraftAction: vi.fn(),
}));
vi.mock("./resource-draft-actions", () => ({ saveResourceDraftAction: vi.fn() }));

import { RelevantFirstJobForm } from "./relevant-first-job-form";

const initialProps = {
  initialResourceDraft: null,
  baseProgressRevision: 5,
  initialConnectionKind: null,
  initialSocialPlatform: null,
  initialDestinationUrl: "",
  baseConnectionRevision: null,
  initialProductSourceUrl: "",
  initialProductTitle: null,
  baseProductRevision: null,
};

describe("S5 focused optional Product entry", () => {
  it.each(["identity_connection", "neutral", "resource"] as const)(
    "%s keeps optional Product inputs mounted inside a closed disclosure",
    (recommendation) => {
      const html = renderToStaticMarkup(createElement(RelevantFirstJobForm, {
        ...initialProps, recommendation,
      }));
      expect(html).toMatch(/<details(?![^>]*\bopen=)[^>]*>/);
      expect(html).toContain("Add a Product (optional)");
      expect(html).toMatch(/<details[^>]*>[\s\S]*name="sourceUrl"[\s\S]*<\/details>/);
      expect(html).toContain("Skip for now");
    },
  );

  it("Affiliate shows Product first without a disclosure", () => {
    const html = renderToStaticMarkup(createElement(RelevantFirstJobForm, {
      ...initialProps, recommendation: "product",
    }));
    expect(html).not.toContain("Add a Product (optional)");
    expect(html).toContain("Add a Resource (optional)");
    expect(html.indexOf('name="sourceUrl"')).toBeLessThan(html.indexOf('name="destinationUrl"'));
    expect(html).toContain("Skip for now");
  });

  it("Business shows Resource meaning before source and other additions", () => {
    const html = renderToStaticMarkup(createElement(RelevantFirstJobForm, {
      ...initialProps, recommendation: "resource",
    }));
    expect(html.indexOf('name="resourceType"')).toBeLessThan(html.indexOf('name="resourceSourceUrl"'));
    expect(html.indexOf('name="resourceSourceUrl"')).toBeLessThan(html.indexOf('name="destinationUrl"'));
    expect(html).not.toContain("Add a Resource (optional)");
    expect(html).toContain("Add a Product (optional)");
    expect(html).toContain("Skip for now");
  });

  it("a saved Resource remains visible after guidance changes", () => {
    const html = renderToStaticMarkup(createElement(RelevantFirstJobForm, {
      ...initialProps, recommendation: "product",
      initialResourceDraft: { resource_type: "menu", source_url: null, title: "Saved menu", revision: 2 },
    }));
    expect(html).toMatch(/<details[^>]*open=""/);
    expect(html).toContain("Your saved Resource Draft");
    expect(html).toContain('value="Saved menu"');
    expect(html).toContain('name="baseResourceRevision" value="2"');
  });

  it("changing guidance retains and exposes an acknowledged Product Draft", () => {
    const html = renderToStaticMarkup(createElement(RelevantFirstJobForm, {
      ...initialProps,
      recommendation: "identity_connection",
      initialProductSourceUrl: "https://example.com/product",
      initialProductTitle: "Saved Product",
      baseProductRevision: 3,
    }));
    expect(html).toMatch(/<details[^>]*open=""/);
    expect(html).toContain("Your saved Product Draft");
    expect(html).toContain('value="https://example.com/product"');
    expect(html).toContain('value="Saved Product"');
    expect(html).toContain('name="baseProductRevision" value="3"');
  });
});
