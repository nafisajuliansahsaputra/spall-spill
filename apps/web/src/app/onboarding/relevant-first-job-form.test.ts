import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  advanceRelevantFirstJobAction: vi.fn(),
  saveIdentityConnectionAction: vi.fn(),
  saveProductDraftAction: vi.fn(),
}));

import { RelevantFirstJobForm } from "./relevant-first-job-form";

const initialProps = {
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
    expect(html).not.toContain("<details");
    expect(html.indexOf('name="sourceUrl"')).toBeLessThan(html.indexOf('name="destinationUrl"'));
    expect(html).toContain("Skip for now");
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
