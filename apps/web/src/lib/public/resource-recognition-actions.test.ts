import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublishedResourceRecognitionActions } from "./resource-recognition-actions";

const recognition = { status: "success", current_handle: "creator", display_name: "Published Owner", spill_reference: 27,
  resource_type: "portfolio", title: "Published Portfolio", available: true,
  source_url: "https://portfolio.example.test/works?creator=original&campaign=A%2FB" };
const token = "A".repeat(43);
const render = (payload: unknown) => renderToStaticMarkup(createElement(PublishedResourceRecognitionActions, { payload }));
describe("staged Resource recognition before native action", () => {
  it("renders canonical context before one exact native form without source links or private fields", () => {
    const payload = { recognition, token }; const before = JSON.stringify(payload); const html = render(payload);
    expect(html).toContain(recognition.title); expect(html).toContain(recognition.display_name); expect(html).toContain("Resource #27");
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<form")); expect(html.match(/<form /g)).toHaveLength(1);
    const form = html.match(/<form ([^>]+)>/)![1]!;
    expect(Object.fromEntries([...form.matchAll(/([a-zA-Z-]+)="([^"]+)"/g)].map(m => [m[1], m[2]])))
      .toEqual({ action: "/actions/resource-open", method: "post", encType: "application/x-www-form-urlencoded", "accept-charset": "UTF-8", target: "_self" });
    expect(html).toContain('type="submit"'); expect(html).toContain("min-h-11");
    expect([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]+)"/g)].map(m => [m[1], m[2]]))
      .toEqual([["handle", "creator"], ["spill_reference", "27"], ["token", token]]);
    expect([...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])).toEqual(["/creator", "/creator/spill"]);
    for (const forbidden of [recognition.source_url, "<script", "provider_key", "publication_token", "source_hash", "download", "Choose marketplace"])
      expect(html).not.toContain(forbidden);
    expect(JSON.stringify(payload)).toBe(before);
  });
  it.each([['menu', 'View Menu'], ['price_list', 'View Price List'], ['catalog', 'Open Catalog'], ['portfolio', 'View Portfolio'],
    ['media_kit', 'View Media Kit / Rate Card'], ['document', 'Open Document'], ['website', 'Visit Website'], ['other', 'Open Resource']])
    ("uses semantic type %s copy %s", (resource_type, label) => { expect(render({ recognition: { ...recognition, resource_type }, token })).toContain(label); });
  it.each([null, {}, { recognition }, { recognition, token: "bad" }, { recognition, token: "A".repeat(42) + "B" },
    { recognition, token, provider_key: "shopee" }, { recognition, token, binding: {} }, { recognition, token, action: "https://evil.test" },
    { recognition: { ...recognition, owner_id: "private" }, token }, { recognition: { ...recognition, available: false }, token }])
    ("denies invalid/private input without forms %j", payload => {
      const html = render(payload); expect(html).toContain("Unavailable"); expect(html).not.toContain("<form"); expect(html).not.toContain(token);
    });
  it.each([null, token])("retains degraded context without action or duplicate status %j", value => {
    const html = render({ recognition: { ...recognition, available: false, source_url: null }, token: value });
    expect(html).toContain(recognition.title); expect(html).not.toContain("<form"); expect(html).not.toContain(token);
    expect(html.match(/role="status"/g)).toHaveLength(1);
  });
  it("retains valid context when no token exists and escapes published text", () => {
    const html = render({ recognition: { ...recognition, title: '<script>alert("x")</script>' }, token: null });
    expect(html).not.toContain("<form"); expect(html).not.toContain("<script"); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Resource source is temporarily unavailable.");
  });
});
