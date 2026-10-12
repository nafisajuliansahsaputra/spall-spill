import { expect, it } from "vitest";
import { chromiumFixture, until } from "./chromium-fixture";

it("actual Chromium drains a paused fixture request before controlled navigation", async () => {
  const browser = await chromiumFixture(); const requests: string[] = []; const errors: string[] = [];
  let pausedRequest: string | undefined;
  try {
    browser.on("Fetch.requestPaused", value => {
      const paused = value as { requestId: string; request: { url: string } };
      requests.push(paused.request.url);
      if (paused.request.url === "https://app.example.test/pending") { pausedRequest = paused.requestId; return; }
      if (!["https://app.example.test/first", "https://app.example.test/second"].includes(paused.request.url)) {
        errors.push(`Unexpected request: ${paused.request.url}`);
        void browser.command("Fetch.failRequest", { requestId: paused.requestId, errorReason: "BlockedByClient" }).catch(e => errors.push(String(e))); return;
      }
      const body = '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Controlled fixture</body></html>';
      void browser.command("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "text/html" }], body: Buffer.from(body).toString("base64") }).catch(e => errors.push(String(e)));
    });
    await browser.command("Page.enable"); await browser.command("Runtime.enable");
    await browser.command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await browser.command("Page.navigate", { url: "https://app.example.test/first" });
    await until(() => browser.evaluate<boolean>("document.readyState === 'complete'"));
    await browser.evaluate("void fetch('/pending').catch(() => {})"); await until(() => pausedRequest !== undefined);
    const navigation = browser.command("Page.navigate", { url: "https://app.example.test/second" });
    await browser.command("Runtime.evaluate", { expression: "1" });
    expect(requests).toEqual(["https://app.example.test/first", "https://app.example.test/pending"]);
    await browser.command("Fetch.fulfillRequest", { requestId: pausedRequest!, responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/plain" }], body: Buffer.from("Released fixture").toString("base64") });
    await navigation; await until(() => browser.evaluate<boolean>("document.readyState === 'complete' && location.pathname === '/second'"));
    expect(requests).toEqual(["https://app.example.test/first", "https://app.example.test/pending", "https://app.example.test/second"]);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});
