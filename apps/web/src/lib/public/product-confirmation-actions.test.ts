import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublishedProductConfirmationActions } from "./product-confirmation-actions";

const product = { status: "success", current_handle: "creator", display_name: "Published Creator", spill_reference: 27,
  title: "Published Product", primary_image_path: "/media/product/creator/27", destinations: [
    { provider_key: "shopee", available: true, destination_url: "https://shopee.co.id/item?affiliate=creator" },
    { provider_key: "tokopedia", available: true, destination_url: "https://tokopedia.com/item" },
  ] };
const intents = [{ provider_key: "shopee", token: "A".repeat(43) }, { provider_key: "tokopedia", token: "E".repeat(43) }];
const bundle = { confirmation: product, intents };
const render = (payload: unknown) => renderToStaticMarkup(createElement(PublishedProductConfirmationActions, { payload }));
describe("unmounted confirmation-before-native-provider-action renderer", () => {
  it("places full recognition before ordered explicit marketplace forms", () => {
    const html = render({ ...bundle, intents: [...intents].reverse() });
    expect(html).toContain('aria-label="Product confirmation"'); expect(html).toContain('href="/creator"');
    expect(html).toContain('href="/creator/spill"'); expect(html).toContain("Product #27");
    expect(html).toContain('src="/media/product/creator/27"'); expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<form"));
    expect(html).toContain("Choose marketplace"); expect(html.indexOf("Open in Shopee")).toBeLessThan(html.indexOf("Open in Tokopedia"));
    const forms = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/g)!; expect(forms).toHaveLength(2);
    forms.forEach((form, index) => {
      expect(form).toContain('action="/actions/product-click"'); expect(form).toContain('method="post"');
      expect(form).toContain('encType="application/x-www-form-urlencoded"'); expect(form).toContain('accept-charset="UTF-8"');
      expect(form).toContain('target="_self"'); expect(form.match(/<input\b/g)).toHaveLength(4);
      for (const [name, value] of Object.entries({ handle: "creator", spill_reference: "27", ...intents[index] }))
        expect(form).toContain(`name="${name}" value="${value}"`);
      expect(form).toContain('type="submit"'); expect(form).not.toContain("disabled");
    });
    for (const forbidden of ["https://", "affiliate=", "destination_url", "publication_token", "<script", "prefetch", "purchase", "Buy Now", "login", "/_next/image"])
      expect(html).not.toContain(forbidden);
  });
  it("uses one direct provider action with no redundant chooser", () => {
    const html = render({ confirmation: { ...product, destinations: product.destinations.slice(0, 1) }, intents: intents.slice(0, 1) });
    expect(html.match(/<form\b/g)).toHaveLength(1); expect(html).toContain("Open in Shopee"); expect(html).not.toContain("Choose marketplace");
  });
  it("derives TikTok Shop and neutral external hostname labels from validated keys", () => {
    const html = render({ confirmation: { ...product, destinations: [
      { provider_key: "tiktok", available: true, destination_url: "https://shop.tiktok.com/item" },
      { provider_key: "external:shop.example.com", available: true, destination_url: "https://shop.example.com/item" },
    ] }, intents: [{ provider_key: "tiktok", token: intents[0]!.token }, { provider_key: "external:shop.example.com", token: intents[1]!.token }] });
    expect(html).toContain("Open in TikTok Shop"); expect(html).toContain("Open in shop.example.com"); expect(html).not.toContain("https://");
  });
  it("retains valid alternatives and hides degraded/nonmatching capabilities", () => {
    const html = render({ confirmation: { ...product, destinations: [product.destinations[0],
      { provider_key: "tokopedia", available: false, destination_url: null }] }, intents: [...intents, { provider_key: "tiktok", token: "I".repeat(43) }] });
    expect(html).toContain("Published Product"); expect(html.match(/<form\b/g)).toHaveLength(1); expect(html).toContain("Open in Shopee");
    expect(html).not.toContain("Open in Tokopedia"); expect(html).not.toContain(intents[1]!.token);
    expect(html).not.toContain("I".repeat(43)); expect(html).toContain("Some marketplace destinations are temporarily unavailable.");
  });
  it.each(["no intents", "all destinations degraded"])("retains Published context and safe navigation for %s", kind => {
    const confirmation = kind === "no intents" ? product : { ...product, destinations: product.destinations.map(d => ({ ...d, available: false, destination_url: null })) };
    const html = render({ confirmation, intents: kind === "no intents" ? [] : intents });
    expect(html).toContain("Published Creator"); expect(html).toContain("Published Product"); expect(html).toContain("Product #27");
    expect(html).toContain('href="/creator/spill"'); expect(html).toContain('src="/media/product/creator/27"');
    expect(html).toContain("Marketplace destinations are temporarily unavailable.");
    expect(html).not.toContain("<form"); expect(html).not.toContain("<button"); expect(html).not.toContain(intents[0]!.token);
  });
  it("keeps an alternative actionable when another available provider has no issued capability", () => {
    const html = render({ ...bundle, intents: intents.slice(1) }); expect(html).toContain("Open in Tokopedia");
    expect(html).not.toContain("Open in Shopee"); expect(html).toContain("Some marketplace destinations are temporarily unavailable.");
  });
  it("escapes Published text and does not mutate input or invent metadata", () => {
    const payload = { ...bundle, confirmation: { ...product, title: '<img src=x onerror="alert(1)">', display_name: "<script>bad</script>" } };
    const before = JSON.stringify(payload); const html = render(payload); expect(JSON.stringify(payload)).toBe(before);
    expect(html).toContain("&lt;img"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script");
    for (const text of ["best price", "cheapest", "No description", "stock", "purchase", "Archive", "Hide"]) expect(html).not.toContain(text);
  });
  it.each([null, {}, { ...bundle, owner_id: "private" }, { ...bundle, action: "https://evil.test" },
    { ...bundle, confirmation: { ...product, working_title: "private" } }, { ...bundle, confirmation: { status: "unavailable" } },
    { ...bundle, intents: [{ ...intents[0], destination_url: "https://evil.test" }] },
    { ...bundle, intents: [{ ...intents[0], token: "bad" }] }, { ...bundle, intents: [{ ...intents[0], token: "A".repeat(42)+"B" }] },
    { ...bundle, intents: [intents[0], intents[0]] }, { ...bundle, intents: [intents[0], { ...intents[1], token: intents[0]!.token }] },
    { ...bundle, intents: Array(11).fill(intents[0]) },
  ])("denies malformed/private bundles generically %j", payload => {
    const html = render(payload); expect(html).toBe(render(null)); expect(html).toContain("This item is not available.");
    for (const text of ["Published Creator", "Published Product", "#27", "<img", "<form", "<input", "private"]) expect(html).not.toContain(text);
  });
});
