import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RESOURCE_TYPES } from "@/lib/onboarding/resource-draft-contract";
import { PublishedResourceRecognition } from "./resource-recognition";

const resource = {
  status: "success", current_handle: "renamed", display_name: "Published Owner", spill_reference: 27,
  resource_type: "portfolio", title: "Published Works", available: true,
  source_url: "https://portfolio.example.test/works?creator=original",
};
const render = (payload: unknown) => renderToStaticMarkup(createElement(PublishedResourceRecognition, { payload }));

describe("staged Published Resource recognition", () => {
  it.each(RESOURCE_TYPES)("uses explicit %s semantics and intentional fallback", (type, label) => {
    const html = render({ ...resource, resource_type: type });
    expect(html).toContain(`>${label}</p>`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(`>${label.charAt(0)}</div>`);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("portfolio.example.test");
  });
  it("orients direct entry in Owner/reference/type/title/visual order with canonical links", () => {
    const html = render(resource);
    expect(html).toContain('aria-label="Resource recognition"');
    expect(html).toContain('aria-label="Creator navigation"');
    expect(html).toContain('href="/renamed"');
    expect(html).toContain("Published Owner"); expect(html).toContain("@renamed");
    expect(html).toContain('href="/renamed/spill"'); expect(html).toContain("Browse Spill");
    expect(html.indexOf("</nav>")).toBeLessThan(html.indexOf("Resource #27"));
    expect(html.indexOf("Resource #27")).toBeLessThan(html.indexOf(">Portfolio</p>"));
    expect(html.indexOf(">Portfolio</p>")).toBeLessThan(html.indexOf("<h1"));
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf('aria-hidden="true"'));
  });
  it("escapes Owner/title markup instead of creating executable attributes", () => {
    const html = render({ ...resource, display_name: '<script>alert("owner")</script>', title: '<img src=x onerror="alert(1)">' });
    expect(html).toContain("&lt;script&gt;"); expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<script"); expect(html).not.toContain('onerror="');
  });
  it("retains Published recognition through source degradation and recovery without mutating input", () => {
    const degraded = Object.freeze({ ...resource, available: false, source_url: null });
    const before = JSON.stringify(degraded); const html = render(degraded);
    expect(html).toContain('role="status"');
    const status = '<p role="status">Resource source is temporarily unavailable.</p>';
    expect(html).toContain(status);
    expect(html.replace(status, "")).toBe(render(resource));
    expect(JSON.stringify(degraded)).toBe(before);
  });
  it.each([resource, { ...resource, available: false, source_url: null }])("emits no source actions or fabricated optional context for %j", payload => {
    const html = render(payload);
    for (const forbidden of ["https://", "creator=", "<form", "<button", "<script", "<iframe", "<embed", "download=", "<img", "No description", "No category", "login", "Related Resources"]) {
      expect(html).not.toContain(forbidden);
    }
    expect(html.match(/<a /g)).toHaveLength(2);
  });
  it("supports maximum reference and bounded long Published text without truncating identity", () => {
    const html = render({ ...resource, spill_reference: Number.MAX_SAFE_INTEGER,
      display_name: "O".repeat(80), title: "T".repeat(160) });
    expect(html).toContain(`#${Number.MAX_SAFE_INTEGER}`);
    expect(html).toContain("O".repeat(80)); expect(html).toContain("T".repeat(160));
    expect(html).toContain("break-words");
  });
  it.each([
    null, { status: "unavailable" }, { status: "unavailable", reason: "hidden" },
    { ...resource, working_title: "private" }, { ...resource, owner_id: "private" },
    { ...resource, current_handle: "../../private" }, { ...resource, resource_type: "pdf" },
    { ...resource, available: false }, { ...resource, source_url: null },
    { ...resource, cover_url: "https://private.example.test/asset" },
    { ...resource, title: " " }, { ...resource, spill_reference: 0 },
    { ...resource, item_type: "product" },
  ])("denies malformed/private/cross-type payload %j with no partial recognition", payload => {
    const html = render(payload);
    expect(html).toBe(render({ status: "unavailable" }));
    expect(html).toContain("This item is not available.");
    for (const forbidden of ["Published Owner", "Published Works", "#27", "Portfolio", "<a", "private", "hidden", "<img"]) {
      expect(html).not.toContain(forbidden);
    }
  });
});
