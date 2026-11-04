import { createServer, type Server } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { chromiumFixture, until } from "./chromium-fixture";

async function listen(server: Server) {
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Missing fixture address");
  return address.port;
}
it("walks connected entry/signup/login/recovery in real Next and Chromium", async () => {
  const calls: string[] = []; let used = false;
  const user = { id: "25600000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated",
    email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const tlsDirectory = await mkdtemp(join(tmpdir(), "spall-entry-tls-"));
  const cert = join(tlsDirectory, "cert.pem"); const key = join(tlsDirectory, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key,
    "-out", cert, "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const provider = createSecureServer({ cert: await readFile(cert), key: await readFile(key) }, async (request, response) => {
    let body = ""; for await (const part of request) body += String(part);
    const path = new URL(request.url!, "http://fixture").pathname; calls.push(path);
    response.setHeader("content-type", "application/json");
    if (path.endsWith("/recover") || path.endsWith("/signup")) { response.end("{}"); return; }
    if (path.endsWith("/verify")) {
      const data = JSON.parse(body);
      if (used || data.type !== "recovery" || data.token_hash !== "a".repeat(64)) {
        response.statusCode = 403; response.end('{"msg":"Invalid token"}'); return;
      }
      used = true; response.end(JSON.stringify({ access_token: "fixture-access", refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, user })); return;
    }
    if (path.endsWith("/user")) {
      expect(request.method).toBe("PUT"); expect(request.headers.authorization).toBe("Bearer fixture-access");
      expect(JSON.parse(body).password).toBe("new-password"); response.end(JSON.stringify(user)); return;
    }
    if (path.endsWith("/logout")) { response.statusCode = 204; response.end(); return; }
    response.statusCode = 400; response.end('{"msg":"Invalid credentials"}');
  });
  const providerPort = await listen(provider);
  const allocation = createServer(); const port = await listen(allocation); await new Promise<void>(r => allocation.close(() => r()));
  const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), process.env.SPALL_ENTRY_COMPILED === "1" ? "start" : "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NODE_EXTRA_CA_CERTS: cert, NEXT_PUBLIC_SUPABASE_URL: `https://127.0.0.1:${providerPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-local-fixture" },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  let logs = ""; app.stdout.on("data", x => { logs += String(x); }); app.stderr.on("data", x => { logs += String(x); });
  const origin = `http://127.0.0.1:${port}`;
  let browser: Awaited<ReturnType<typeof chromiumFixture>> | undefined;
  try {
    await until(async () => { if (app.exitCode !== null) throw new Error("Next exited: " + logs.slice(-1000)); try { return (await fetch(origin, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } }, 40000);
    browser = await chromiumFixture();
    const b = browser;
    const errors: string[] = []; b.on("Runtime.exceptionThrown", x => errors.push(JSON.stringify(x)));
    await b.command("Runtime.enable"); await b.command("Page.enable");
    const visit = async (path: string, text: string) => {
      await b.command("Page.navigate", { url: origin + path });
      await until(() => b.evaluate<boolean>(`document.readyState === 'complete' && document.body.innerText.includes(${JSON.stringify(text)})`), 20000);
    };
    const input = async (name: string, value: string) => b.evaluate(`(() => { const el=document.querySelector('[name="${name}"]'); el.value=${JSON.stringify(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    const submit = async () => { await b.evaluate("document.querySelector('form').requestSubmit()"); };
    const text = async (value: string) => until(() => b.evaluate<boolean>(`document.body.innerText.includes(${JSON.stringify(value)})`), 20000);
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      await visit("/", "A little you.");
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
      expect(await b.evaluate("document.querySelectorAll('h1').length")).toBe(1);
    }
    await b.command("Page.navigate", { url: origin + "/" }); await text("A little you.");
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    expect(await b.evaluate("document.activeElement.textContent")).toBe("Skip to content");
    const capture = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/spall-256-home.png", Buffer.from(capture.data, "base64"));
    await b.evaluate("document.querySelector('a[href=\"/signup\"]').click()"); await text("Make a little space for you.");
    await input("email", "owner@example.test"); await input("password", "new-password"); await submit(); await text("Check your email to continue.");
    expect(calls).toContain("/auth/v1/signup");
    await visit("/login", "Good to have you back.");
    await input("email", "owner@example.test"); await input("password", "wrong-password"); await submit(); await text("We couldn't sign you in");
    await b.evaluate("document.querySelector('a[href=\"/recovery\"]').click()"); await text("Let’s get you back in.");
    expect(await b.evaluate("location.pathname")).toBe("/recovery");
    await input("email", "owner@example.test"); await submit(); await text("If recovery is available");
    expect(calls).toContain("/auth/v1/recover"); expect(await b.evaluate("document.querySelector('button[type=submit]').disabled")).toBe(true);
    await visit("/recovery?token_hash=bad", "This recovery link isn’t valid");
    const tokenPath = "/recovery?token_hash=" + "a".repeat(64);
    const headers = await fetch(origin + tokenPath);
    expect(headers.headers.get("cache-control")).toContain("no-store"); expect(headers.headers.get("referrer-policy")).toBe("no-referrer");
    await visit(tokenPath, "A fresh start."); expect(calls.filter(x => x.endsWith("/verify"))).toHaveLength(0);
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    await input("password", "new-password"); await input("confirmation", "different-password"); await submit(); await text("Your passwords don’t match");
    expect(calls.filter(x => x.endsWith("/verify"))).toHaveLength(0);
    await input("password", "new-password"); await input("confirmation", "new-password"); await submit(); await text("Your password has been updated.");
    expect(await b.evaluate("location.pathname")).toBe("/login"); expect(calls).toContain("/auth/v1/user"); expect(calls).toContain("/auth/v1/logout");
    await visit(tokenPath, "A fresh start."); await input("password", "new-password"); await input("confirmation", "new-password"); await submit(); await text("It may be expired or already used");
    expect(calls.filter(x => x.endsWith("/user"))).toHaveLength(1); expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    if (app.pid) { try { process.kill(-app.pid, "SIGTERM"); } catch {} }
    provider.closeAllConnections(); await new Promise<void>(r => provider.close(() => r()));
    await rm(tlsDirectory, { recursive: true, force: true });
    await writeFile("/tmp/spall-256-browser-server.log", logs.replace(/token_hash=[^\s]+/g, "token_hash=[redacted]"));
  }
});
