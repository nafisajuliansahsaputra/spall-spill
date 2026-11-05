import { createHmac } from "node:crypto";
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
it("connects auth, onboarding and returning Profile Working in real Next and Chromium", async () => {
  const calls: string[] = []; let used = false; let unavailable = false;
  let accountState: "onboarding_incomplete" | "restricted" | "suspended" | "active" = "onboarding_incomplete";
  let failLogout = false; let budgetDenied = false; let loseAcknowledgment = false;
  const gatewayOperations: string[] = [];
  let overlay: null | { display_name: string | null; bio: string | null; revision: number; source_profile_revision: number } = null;
  function currentOverlay(): typeof overlay { return overlay; }
  let pauseStateRead = false; const releaseStateReads: (() => void)[] = [];
  const user = { id: "25600000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated",
    email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const steps = ["claim_handle", "primary_use_case", "basic_identity", "starter_composition", "relevant_first_job", "preview_publish"];
  const setup = { step: 0, revision: 1, handle: null as string | null, useCase: null as string | null,
    identity: null as null | { display_name: string; bio: string | null; profile_asset_key: null; revision: number },
    layout: null as null | { starter_key: string; revision: number } };
  const jwtPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwtHeader = jwtPart({ alg: "HS256", typ: "JWT" });
  const jwtPayload = jwtPart({ sub: user.id, aud: "authenticated", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), iss: "isolated-provider" });
  const access = `${jwtHeader}.${jwtPayload}.${createHmac("sha256", "isolated-test-signing-key").update(`${jwtHeader}.${jwtPayload}`).digest("base64url")}`;
  const tlsDirectory = await mkdtemp(join(tmpdir(), "spall-entry-tls-"));
  const cert = join(tlsDirectory, "cert.pem"); const key = join(tlsDirectory, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-keyout", key,
    "-out", cert, "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
  const provider = createSecureServer({ cert: await readFile(cert), key: await readFile(key) }, async (request, response) => {
    let body = ""; for await (const part of request) body += String(part);
    const path = new URL(request.url!, "http://fixture").pathname; calls.push(path);
    response.setHeader("content-type", "application/json");
    if (path === "/redis") {
      const command = JSON.parse(body); expect(command[0]).toBe("eval");
      expect(command[2]).toBe(2); expect(command[3]).toContain("spall-identity-text-editor:profile-");
      expect(command[3]).not.toContain(user.id);
      response.end(JSON.stringify({ result: budgetDenied ? 0 : 1 })); return;
    }
    if (path.endsWith("/recover") || path.endsWith("/signup")) { response.end("{}"); return; }
    if (path.endsWith("/verify")) {
      const data = JSON.parse(body);
      if (used || data.type !== "recovery" || data.token_hash !== "a".repeat(64)) {
        response.statusCode = 403; response.end('{"msg":"Invalid token"}'); return;
      }
      used = true; response.end(JSON.stringify({ access_token: "fixture-access", refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, user })); return;
    }
    if (path.endsWith("/token") && JSON.parse(body).password === "new-password") {
      response.end(JSON.stringify({ access_token: access, refresh_token: "isolated-refresh", token_type: "bearer", expires_in: 3600, user })); return;
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      const name = path.split("/").at(-1)!; const data = JSON.parse(body);
      expect(request.headers["content-profile"]).toBe("api"); expect(request.headers.authorization).toBe(name === "execute_owner_profile_editor_server" ? "Bearer isolated-service-role" : `Bearer ${access}`);
      if (name === "execute_owner_profile_editor_server") {
        expect(data.input_subject).toBe(user.id); gatewayOperations.push(data.input_operation);
        let result: unknown;
        const context = { status: "success", current_handle: setup.handle, primary_use_case: setup.useCase };
        if (data.input_operation === "resolve_current_owner_home_context") result = context;
        else if (data.input_operation === "resolve_current_owner_editable_identity_working_page") {
          expect(data.input_payload).toEqual({ input_request: { expected_collection_revision: null, after_position: null } });
          result = { ...context, profile_working: setup.identity, layout_working: setup.layout,
            connection_source_working: null, legacy_identity_work: "unchanged", publication_comparison: "not_assessed",
            profile_text_working: overlay, profile_text_state: overlay ? "saved" : "source",
            revision_vector: { profile: setup.identity!.revision, layout: setup.layout!.revision, connection: null, blocks: null, profile_text: overlay?.revision ?? null }, collection: null };
        } else if (data.input_operation === "save_current_owner_profile_text_working") {
          const value = data.input_payload.input_working;
          if (value.base_profile_revision !== setup.identity!.revision || value.base_text_revision !== (overlay?.revision ?? null)) result = { status: "stale_write" };
          else { overlay = { ...value.profile_text_working, revision: (overlay?.revision ?? 0) + 1, source_profile_revision: setup.identity!.revision };
            result = { status: "success", text_revision: overlay!.revision, source_profile_revision: setup.identity!.revision };
            if (loseAcknowledgment) { response.statusCode = 503; response.end('{"message":"fixture acknowledgment lost"}'); return; } }
        } else throw new Error("Unexpected gateway operation");
        response.end(JSON.stringify(result)); return;
      }
      if (name === "resolve_current_onboarding_state") {
        if (pauseStateRead) await new Promise<void>(resolve => { releaseStateReads.push(resolve); });
        if (unavailable) { response.statusCode = 503; response.end('{"message":"fixture provider detail"}'); return; }
      }
      let result: unknown;
      if (name === "resolve_current_owner_state") result = { status: accountState, owner_id: "25800000-0000-4000-8000-000000000001", account_state: accountState === "onboarding_incomplete" ? "active" : accountState, onboarding_completed: accountState === "active" };
      else if (name === "resolve_current_onboarding_state") result = { status: "success", current_step: steps[setup.step], current_handle: setup.handle, primary_use_case: setup.useCase, revision: setup.revision };
      else if (name === "resolve_current_basic_identity_state") result = { status: "success", identity_working: setup.identity };
      else if (name === "resolve_current_starter_composition_state") result = { status: "success", layout_working: setup.layout };
      else if (name === "resolve_current_relevant_first_job_state") result = { status: "success", current_step: steps[setup.step], primary_use_case: setup.useCase, recommended_first_job: "identity_connection", progress_revision: setup.revision };
      else if (name === "resolve_current_identity_connection_state") result = { status: "success", current_step: steps[setup.step], connection_working: null };
      else if (name === "resolve_current_product_draft_state") result = { status: "success", current_step: steps[setup.step], product_draft: null };
      else if (name === "resolve_current_resource_draft_state") result = { status: "success", current_step: steps[setup.step], resource_draft: null };
      else if (name === "resolve_current_onboarding_preview") result = {
        status: "success", current_step: "preview_publish", progress_revision: setup.revision, current_handle: setup.handle,
        identity_working: setup.identity, layout_working: setup.layout, identity_validation_issues: [],
        connection_working: null, product_draft: null, resource_draft: null, snapshot_hash: "b".repeat(64),
      };
      else if (name === "confirm_current_onboarding_preview") {
        expect(data.input_snapshot_hash).toBe("b".repeat(64));
        result = { status: "success", receipt_id: "25800000-0000-4000-8000-000000000002", snapshot_hash: "b".repeat(64), expires_at: new Date(Date.now() + 600000).toISOString() };
      }
      else if (["claim_current_owner_handle", "set_current_owner_primary_use_case", "save_current_owner_basic_identity", "save_current_owner_starter_composition", "advance_current_owner_relevant_first_job"].includes(name)) {
        if ((data.base_revision ?? data.base_progress_revision) !== setup.revision) result = { status: "progress_stale" };
        else {
          if (name === "claim_current_owner_handle") { setup.handle = data.input_handle; setup.step = Math.max(setup.step, 1); }
          if (name === "set_current_owner_primary_use_case") { setup.useCase = data.input_primary_use_case; setup.step = Math.max(setup.step, 2); }
          if (name === "save_current_owner_basic_identity") { setup.identity = { display_name: data.input_display_name, bio: data.input_bio, profile_asset_key: null, revision: (setup.identity?.revision ?? 0) + 1 }; setup.step = Math.max(setup.step, 3); }
          if (name === "save_current_owner_starter_composition") { setup.layout = { starter_key: data.input_starter_key, revision: 1 }; setup.step = Math.max(setup.step, 4); }
          if (name === "advance_current_owner_relevant_first_job") setup.step = 5;
          setup.revision++; result = { status: "success" };
        }
      } else throw new Error(`Unexpected onboarding RPC ${name}`);
      response.end(JSON.stringify(result)); return;
    }
    if (path.endsWith("/user")) {
      if (request.method === "GET") { response.end(JSON.stringify(user)); return; }
      expect(request.method).toBe("PUT"); expect(request.headers.authorization).toBe("Bearer fixture-access");
      expect(JSON.parse(body).password).toBe("new-password"); response.end(JSON.stringify(user)); return;
    }
    if (path.endsWith("/logout")) {
      expect(new URL(request.url!, "https://fixture").searchParams.get("scope")).toBe("local");
      if (failLogout) { response.statusCode = 503; response.end('{"msg":"fixture private logout failure"}'); return; }
      response.statusCode = 204; response.end(); return; }
    response.statusCode = 400; response.end('{"msg":"Invalid credentials"}');
  });
  const providerPort = await listen(provider);
  const allocation = createServer(); const port = await listen(allocation); await new Promise<void>(r => allocation.close(() => r()));
  // Controlled provider relay for the actual strict Upstash transport. No production
  // bypass/configuration is added; only this child process loads the test relay.
  const relay = join(tlsDirectory, "redis-relay.cjs");
  await writeFile(relay, `const original = globalThis.fetch; globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://fixture.upstash.io/") return original(url, init);
    const response = await original("https://127.0.0.1:${providerPort}/redis", init);
    return new Response(response.body, { status: response.status, headers: response.headers });
  };`);
  const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), process.env.SPALL_ENTRY_COMPILED === "1" ? "start" : "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${relay}`, SUPABASE_SERVICE_ROLE_KEY: "isolated-service-role", UPSTASH_REDIS_REST_URL: "https://fixture.upstash.io", UPSTASH_REDIS_REST_TOKEN: "fixture-budget-token", SPALL_OWNER_PROFILE_BUDGET_NAMESPACE: "browser", NEXT_TELEMETRY_DISABLED: "1", NODE_EXTRA_CA_CERTS: cert, NEXT_PUBLIC_SUPABASE_URL: `https://127.0.0.1:${providerPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-local-fixture" },
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
    await b.command("Runtime.enable"); await b.command("Page.enable"); await b.command("Log.enable");
    const cspErrors: string[] = [];
    b.on("Log.entryAdded", value => { const entry = (value as { entry: { text: string } }).entry;
      if (/Content Security Policy|Refused to.*(style|script)/i.test(entry.text)) cspErrors.push(entry.text);
    });
    const visit = async (path: string, text: string) => {
      await b.command("Page.navigate", { url: origin + path });
      await until(() => b.evaluate<boolean>(`document.readyState === 'complete' && document.body.innerText.includes(${JSON.stringify(text)})`), 20000);
    };
    const input = async (name: string, value: string) => {
      await b.evaluate(`(() => { const el=document.querySelector('[name="${name}"]'); el.focus(); el.select(); })()`);
      if (value) await b.command("Input.insertText", { text: value });
      else {
        await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      }
    };
    const submit = async () => { await b.evaluate(`document.querySelector('form:not([aria-label="Sign out"])').requestSubmit()`); };
    const text = async (value: string) => until(() => b.evaluate<boolean>(`document.body?.innerText.includes(${JSON.stringify(value)}) === true`), 20000);
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
    expect(await b.evaluate("document.title")).toBe("Log in | Spall Spill");
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
    expect(calls.filter(x => x.endsWith("/user"))).toHaveLength(1);
    await visit("/login", "Good to have you back."); await input("email", "owner@example.test"); await input("password", "new-password"); await submit(); await text("Claim your Handle");
    expect(await b.evaluate("location.pathname")).toBe("/onboarding");
    await visit("/onboarding?step=preview_publish", "Claim your Handle");
    expect(setup.step).toBe(0); expect(await b.evaluate("document.querySelectorAll('.setup-steps a').length")).toBe(1);
    await input("handle", "fixture-creator"); await submit(); await text("What are you starting");
    await b.evaluate("document.querySelector('input[name=primaryUseCase][value=personal]').click()"); await submit(); await text("Build your Basic Identity");
    await input("displayName", "Saved Creator"); await input("bio", "Private working biography"); await submit(); await text("Choose your starting");
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
      expect(await b.evaluate("document.querySelectorAll('.setup-steps a[aria-current=step]').length")).toBe(1);
    }
    const setupScreenshot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/spall-258-onboarding.png", Buffer.from(setupScreenshot.data, "base64"));
    await b.evaluate("document.querySelector('input[name=starterKey][value=clean]').click()"); await submit(); await text("Add something useful");
    expect(setup.step).toBe(4); expect(setup.layout?.starter_key).toBe("clean");
    await visit("/onboarding?step=basic_identity", "Build your Basic Identity");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Saved Creator");
    expect(await b.evaluate("document.querySelector('[name=bio]').value")).toBe("Private working biography");
    expect(await b.evaluate("document.body.innerText.includes('Your saved progress remains at Step 5')")).toBe(true);
    setup.revision++; // Another tab acknowledged a change after this form was loaded.
    await submit(); await text("Your onboarding progress changed");
    expect(setup.identity?.display_name).toBe("Saved Creator"); expect(setup.step).toBe(4);
    await visit("/onboarding", "Add something useful");
    await b.evaluate("[...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Skip for now').click()");
    await text("Private preview."); expect(setup.step).toBe(5);
    expect(await b.evaluate("document.querySelector('[aria-label=\"Private Identity preview\"]').textContent.includes('Saved Creator')")).toBe(true);
    await submit(); await text("Preview confirmed privately. Nothing has been published.");
    expect(calls).toContain("/rest/v1/rpc/confirm_current_onboarding_preview");
    expect(calls.some(x => x.includes("publish_current"))).toBe(false); expect(errors).toEqual([]); expect(cspErrors).toEqual([]);
    pauseStateRead = true;
    await b.command("Page.navigate", { url: origin + "/onboarding" }); await text("Loading your saved setup");
    await until(() => releaseStateReads.length > 0); pauseStateRead = false;
    for (const release of releaseStateReads.splice(0)) release(); await text("Private preview.");
    unavailable = true; await visit("/onboarding", "We couldn’t load your setup.");
    expect(await b.evaluate("document.body.innerText.includes('fixture provider detail')")).toBe(false);
    unavailable = false; await b.evaluate("document.querySelector('a[href=\"/onboarding\"]').click()");
    await text("Private preview."); expect(setup.identity?.display_name).toBe("Saved Creator"); expect(setup.step).toBe(5);
    // Native Account disclosure works with the keyboard and never submits Working.
    const savedRevision = setup.revision;
    await b.evaluate("document.querySelector('.private-session-menu summary').focus()");
    expect(await b.evaluate("document.activeElement?.tagName")).toBe("SUMMARY");
    await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
    await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await until(() => b.evaluate<boolean>("document.querySelector('.private-session-menu')?.open === true"));
    expect(setup.revision).toBe(savedRevision);
    expect(await b.evaluate("document.querySelectorAll('form form').length")).toBe(0);
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    const logout = async () => { await b.evaluate(`document.querySelector('form[aria-label="Sign out"]').requestSubmit()`); };
    failLogout = true;
    await logout(); await text("We couldn't confirm Sign Out. Please try again.");
    expect(await b.evaluate("location.pathname")).toBe("/onboarding");
    const failedLogoutCookies = await b.command<{ cookies: { name: string }[] }>("Network.getCookies", { urls: [origin] });
    expect(failedLogoutCookies.cookies.some(cookie => cookie.name.includes("auth-token"))).toBe(true);
    expect(await b.evaluate("document.body.innerText.includes('fixture private logout failure')")).toBe(false);
    await visit("/auth/resolve", "Private preview."); // Failed logout retains usable authentication.
    for (const status of ["restricted", "suspended"] as const) {
      accountState = status;
      await visit("/onboarding", status === "restricted" ? "Your account access is restricted" : "Your account is suspended");
      expect(await b.evaluate("location.pathname")).toBe("/dashboard/account-status");
      expect(await b.evaluate("document.title")).toBe("Account status | Spall Spill");
      expect(await b.evaluate("document.body.innerText.includes('25800000-0000')")).toBe(false);
      expect(await b.evaluate("document.querySelectorAll('form').length")).toBe(1);
    }
    failLogout = false;
    await logout(); await text("Good to have you back.");
    expect(await b.evaluate("location.pathname")).toBe("/login");
    const cookies = await b.command<{ cookies: { name: string }[] }>("Network.getCookies", { urls: [origin] });
    expect(cookies.cookies.some(cookie => cookie.name.includes("auth-token"))).toBe(false);
    const readsAfterLogout = calls.filter(call => call.startsWith("/rest/v1/rpc/")).length;
    await visit("/onboarding", "Good to have you back.");
    expect(await b.evaluate("location.pathname")).toBe("/login");
    expect(calls.filter(call => call.startsWith("/rest/v1/rpc/")).length).toBe(readsAfterLogout);
    accountState = "onboarding_incomplete";
    await input("email", "owner@example.test"); await input("password", "new-password"); await submit(); await text("Private preview.");
    expect(setup.identity?.display_name).toBe("Saved Creator"); expect(setup.step).toBe(5);
    expect(setup.revision).toBe(savedRevision);
    const errorsBeforeEditor = errors.length;
    accountState = "active";
    await visit("/dashboard/identity", "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Saved Creator");
    for (const width of [360, 768, 1440]) {
      await b.command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
      expect(await b.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
    }
    const editorScreenshot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    await writeFile("/tmp/spall-260-editor.png", Buffer.from(editorScreenshot.data, "base64"));
    await input("displayName", ""); await input("bio", " Raw\n Bio "); await submit();
    await text("Working saved. Your published Identity has not changed.");
    expect(currentOverlay()?.display_name).toBe(""); expect(currentOverlay()?.bio).toBe(" Raw\r\n Bio ");
    expect(setup.identity?.display_name).toBe("Saved Creator");
    await b.evaluate(`document.querySelector('a[href="/dashboard/identity"]').click()`); await text("Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("");
    expect(await b.evaluate("document.querySelector('[name=bio]').value")).toBe(" Raw\n Bio ");
    const savesBeforeUnknown = gatewayOperations.filter(operation => operation === "save_current_owner_profile_text_working").length;
    loseAcknowledgment = true;
    await input("displayName", "Saved despite lost acknowledgment"); await submit(); await text("We couldn’t confirm this save.");
    expect(currentOverlay()?.display_name).toBe("Saved despite lost acknowledgment");
    expect(gatewayOperations.filter(operation => operation === "save_current_owner_profile_text_working")).toHaveLength(savesBeforeUnknown + 1);
    expect(await b.evaluate("document.querySelector('form[aria-label=\"Profile Working\"] button').disabled")).toBe(true);
    loseAcknowledgment = false;
    await visit("/dashboard/identity", "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Saved despite lost acknowledgment");
    overlay = { display_name: "Another tab", bio: "Saved elsewhere", revision: 3, source_profile_revision: setup.identity!.revision };
    await input("displayName", "Keep my conflicting input"); await submit(); await text("We couldn’t confirm this save.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Keep my conflicting input");
    expect(await b.evaluate("document.querySelector('form[aria-label=\"Profile Working\"] button').disabled")).toBe(true);
    await visit("/dashboard/identity", "Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Another tab");
    expect(errors.length).toBe(errorsBeforeEditor);
    const gatewayCalls = calls.filter(call => call.endsWith("execute_owner_profile_editor_server")).length;
    budgetDenied = true; await visit("/dashboard/identity", "We couldn’t load your Identity Working.");
    expect(calls.filter(call => call.endsWith("execute_owner_profile_editor_server"))).toHaveLength(gatewayCalls);
    budgetDenied = false;
    await b.evaluate(`document.querySelector('a[href="/dashboard/identity"]').click()`); await text("Your Identity, in progress.");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Another tab");
    await b.evaluate("document.querySelector('.private-session-menu summary').click()");
    await logout(); await text("Good to have you back.");
    await visit("/dashboard/identity", "Good to have you back.");
    await input("email", "owner@example.test"); await input("password", "new-password"); await submit();
    await text("Your Identity, in progress.");
    expect(await b.evaluate("location.pathname")).toBe("/dashboard/identity");
    expect(await b.evaluate("document.querySelector('[name=displayName]').value")).toBe("Another tab");
    expect(calls.some(call => call.includes("publish_current"))).toBe(false);
    expect(cspErrors).toEqual([]);
  } finally {
    await browser?.close();
    if (app.pid) { try { process.kill(-app.pid, "SIGTERM"); } catch {} }
    provider.closeAllConnections(); await new Promise<void>(r => provider.close(() => r()));
    await rm(tlsDirectory, { recursive: true, force: true });
    await writeFile("/tmp/spall-256-browser-server.log", logs.replace(/token_hash=[^\s]+/g, "token_hash=[redacted]"));
  }
});
