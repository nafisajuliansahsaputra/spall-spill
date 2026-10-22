import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, timingSafeEqual, X509Certificate } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServerClient } from "@supabase/ssr";
import { chromiumFixture, until } from "./chromium-fixture.ts";

const require = createRequire(import.meta.url), web = fileURLToPath(new URL("..", import.meta.url)), source = resolve(web, "src");
const publicKey = "isolated-public-placeholder", signingKey = randomBytes(32), refreshSubjects = new Map();
const subjects = ["91000000-0000-4000-8000-000000000001", "91000000-0000-4000-8000-000000000002"];
const owners = ["92000000-0000-4000-8000-000000000001", "92000000-0000-4000-8000-000000000002"];
const ids = ["93000000-0000-4000-8000-000000000001", "93000000-0000-4000-8000-000000000002"];
let provider, child, directory, providerOrigin, nextOrigin, certificate, cookieA, cookieB, siblingServer, siblingOrigin, gatewayServer, gatewayPort;
let gatewayForwards = 0, gatewayRejections = 0;
let authRequests = 0, refreshCalls = 0, acceptRefresh = false, maximumDistinctSubjectsInFlight = 0;
const inFlightSubjects = new Map();
let calls = [], authCalls = 0, budgetCalls = 0, mutations = 0, budgetResult = 1, restricted = false, malformedAck = false, fixtureError;
const models = new Map(), events = [], observations = [];
const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", T = "resolve_current_owner_text_block_working";
const I = "initialize_current_owner_blocks_from_text", A = "add_current_owner_text_block_working", W = "save_current_owner_block_text_working";
const actions = ["initialize_text_block", "add_text_block", "save_text_block"];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(server.address().port)); });
function token(subject, lifetime = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: subject, iss: `${providerOrigin}/auth/v1`, aud: "authenticated", role: "authenticated", iat: now, exp: now + lifetime })).toString("base64url");
  return `${header}.${payload}.${createHmac("sha256", signingKey).update(`${header}.${payload}`).digest("base64url")}`;
}
function verify(value) {
  try {
    const [header, payload, signature, extra] = value.split(".");
    if (extra !== undefined || JSON.parse(Buffer.from(header, "base64url")).alg !== "HS256") return null;
    const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", signingKey).update(`${header}.${payload}`).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    return subjects.includes(claims.sub) && claims.iss === `${providerOrigin}/auth/v1` && claims.aud === "authenticated"
      && claims.exp > Math.floor(Date.now() / 1000) ? claims.sub : null;
  } catch { return null; }
}
async function encodeSession(subject, lifetime) {
  const jar = new Map();
  const client = createServerClient(providerOrigin, publicKey, { cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: values => { for (const { name, value, options } of values) {
      if (options?.maxAge === 0) jar.delete(name); else jar.set(name, value);
    } },
  } });
  const refresh = `isolated-refresh-${randomBytes(16).toString("hex")}`; refreshSubjects.set(refresh, subject);
  const { error } = await client.auth.setSession({ access_token: token(subject, lifetime), refresh_token: refresh });
  assert.equal(error, null, "fixture session issuance must succeed through actual SSR SDK");
  assert.ok(jar.size > 0, "actual SSR SDK must encode cookies");
  return [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}

const context = i => ({ status: "success", current_handle: `fixture-owner-${i}`, primary_use_case: "personal" });
const command = (action = actions[0], text = " <Raw> 😀 ") => ({ action, base_collection_revision: action === actions[0] ? null : 3,
  ...(action === actions[2] ? { block_id: ids[0] } : { is_visible: false }), text_working: { kind: "text", text } });
function seed(subject, text = "Existing") {
  const i = subjects.indexOf(subject); models.set(subject, { revision: 3, block: { block_id: ids[i], kind: "text", position: 1,
    is_visible: false, payload_state: "present", text_working: { text } } });
}
async function body(req) {
  let value = ""; for await (const part of req) { value += part; assert.ok(Buffer.byteLength(value) <= 32768, "bounded fixture body"); }
  return JSON.parse(value);
}
async function rpc(req, subject) {
  assert.equal(req.method, "POST"); assert.equal(req.headers["content-profile"], "api");
  const name = req.url.slice("/rest/v1/rpc/".length), i = subjects.indexOf(subject), value = await body(req), model = models.get(subject);
  assert.ok([S, C, T, I, A, W].includes(name), "closed fixture RPC allowlist"); calls.push({ name, subject });
  if (name === S) { assert.deepEqual(value, {}); return { status: restricted ? "restricted" : "active", owner_id: owners[i],
    account_state: restricted ? "restricted" : "active", onboarding_completed: true }; }
  if (name === C) { assert.deepEqual(value, {}); return context(i); }
  if (name === T) {
    assert.deepEqual(value, { input_block_id: ids[i] }); assert.ok(model);
    return { ...context(i), collection_revision: model.revision, block: model.block };
  }
  assert.deepEqual(Object.keys(value), [name === W ? "input_working" : "input_intent"]);
  const input = name === W ? value.input_working : value.input_intent;
  assert.deepEqual(Object.keys(input).sort(), name === W ? ["base_collection_revision", "block_id", "text_working"]
    : ["action", "base_collection_revision", "is_visible", "text_working"]);
  if (name !== W) assert.equal(input.action, name === I ? actions[0] : actions[1]);
  assert.equal(input.text_working.kind, "text"); assert.deepEqual(Object.keys(input.text_working).sort(), ["kind", "text"]);
  if (name === I && model) return { status: "already_initialized" };
  if (name !== I && (!model || model.revision !== input.base_collection_revision)) return { status: "stale_write" };
  if (name === W && input.block_id !== model.block.block_id) return { status: "block_not_found" };
  assert.equal(input.base_collection_revision, name === I ? null : 3);
  const revision = name === I ? 1 : model.revision + 1;
  const block = { block_id: ids[i], kind: "text", position: 1, is_visible: name === W ? model.block.is_visible : input.is_visible,
    payload_state: "present", text_working: { text: input.text_working.text } };
  models.set(subject, { revision, block }); mutations++;
  return malformedAck ? { status: "success", private_fixture_marker: true } : { status: "success", block_id: ids[i], collection_revision: revision };
}
function request(cookie, value = command(), headers = {}, suffix = "", method = "POST", trust = true, transport = {}) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(nextOrigin, { ...(transport.gateway ? { port: gatewayPort } : {}), path: transport.path ?? `/api/editor${suffix}`, method, ...(trust ? { ca: certificate } : {}), family: 4, servername: "localhost",
      headers: { origin: nextOrigin, host: new URL(nextOrigin).host, "content-type": "application/json", "content-length": Buffer.byteLength(raw),
        ...(cookie ? { cookie } : {}), ...headers }, signal: AbortSignal.timeout(15000) }, res => {
      let output = ""; res.setEncoding("utf8"); res.on("data", part => { output += part; if (Buffer.byteLength(output) > 131072) req.destroy(new Error("bounded fixture response")); });
      res.on("error", reject); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, raw: output }));
    }); req.on("error", reject); req.end(raw);
  });
}
function check(response, status, expected) {
  assert.equal(fixtureError, undefined, "controlled provider contract failed"); assert.equal(response.status, status);
  for (const [key, value] of Object.entries({ "cache-control": "private, no-store, max-age=0", pragma: "no-cache", expires: "0",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "content-type": "application/json; charset=utf-8" })) assert.equal(response.headers[key], value);
  for (const key of ["location", "access-control-allow-origin", "authorization"]) assert.equal(response.headers[key], undefined);
  const result = JSON.parse(response.raw); if (expected) assert.deepEqual(result, expected); return result;
}
before(async () => {
  provider = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    try {
      if (req.url === "/fixture-observation") {
        assert.equal(req.method, "POST");
        let raw = ""; for await (const part of req) { raw += part; assert.ok(raw.length < 2048); }
        const value = JSON.parse(raw);
        assert.deepEqual(Object.keys(value).sort(), ["hasCookie", "origin", "site", "status", "type"]);
        assert.equal(typeof value.hasCookie, "boolean"); observations.push(value);
        res.end('{}'); return;
      }
      if (req.url === "/fixture-budget") {
        assert.equal(req.method, "POST"); assert.equal(req.headers.authorization, "Bearer isolated-budget-placeholder");
        const wire = await body(req); assert.equal(wire.length, 9); assert.equal(wire[0], "eval"); assert.equal(wire[2], 2);
        assert.match(wire[3], /^spall-identity-text-editor:text-runtime:\{[a-f0-9]{64}\}:command$/);
        assert.equal(wire[4], wire[3].replace(/:command$/, ":work")); assert.deepEqual(wire.slice(5), ["60000", "100", "1300", "13"]);
        events.push("budget"); budgetCalls++; res.end(JSON.stringify({ result: budgetResult })); return;
      }
      if (req.url.startsWith("/auth/v1/")) authRequests++;
      if (req.method === "POST" && req.url === "/auth/v1/token?grant_type=refresh_token") {
        refreshCalls++; events.push("refresh"); assert.equal(req.headers.apikey, publicKey);
        let raw = ""; for await (const part of req) { raw += part; assert.ok(Buffer.byteLength(raw) <= 4096); }
        const value = JSON.parse(raw); assert.deepEqual(Object.keys(value), ["refresh_token"]);
        const subject = refreshSubjects.get(value.refresh_token);
        if (!acceptRefresh || !subject) {
          res.writeHead(400); res.end('{"code":"refresh_token_not_found","message":"Fixture refresh denied"}'); return;
        }
        const rotated = `isolated-rotated-${randomBytes(16).toString("hex")}`; refreshSubjects.set(rotated, subject);
        res.end(JSON.stringify({ access_token: token(subject), refresh_token: rotated, token_type: "bearer", expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: subject, aud: "authenticated", role: "authenticated",
            app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" } })); return;
      }
      if (req.url === "/auth/v1/user") events.push("auth");
      assert.equal(req.headers.apikey, publicKey);
      const subject = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!subject) { res.writeHead(401); res.end('{"code":"bad_jwt","message":"Fixture credential denied"}'); return; }
      if (req.url.startsWith("/rest/v1/rpc/")) { events.push("rpc"); res.end(JSON.stringify(await rpc(req, subject))); return; }
      assert.equal(req.method, "GET"); assert.equal(req.url, "/auth/v1/user"); authCalls++;
      inFlightSubjects.set(subject, (inFlightSubjects.get(subject) ?? 0) + 1);
      maximumDistinctSubjectsInFlight = Math.max(maximumDistinctSubjectsInFlight, inFlightSubjects.size);
      await delay(10);
      const remaining = inFlightSubjects.get(subject) - 1;
      if (remaining) inFlightSubjects.set(subject, remaining); else inFlightSubjects.delete(subject);
      res.end(JSON.stringify({ id: subject, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" }));
    } catch { fixtureError = true; res.writeHead(500); res.end('{"status":"fixture_error"}'); }
  });
  providerOrigin = `http://127.0.0.1:${await listen(provider)}`;
  const reservation = createServer(), port = await listen(reservation); await new Promise(resolve => reservation.close(resolve)); nextOrigin = `https://localhost:${port}`;
  directory = await mkdtemp(join(tmpdir(), "spall-next-text-editor-")); const keyPath = join(directory, "fixture-key.pem"), certPath = join(directory, "fixture-cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", keyPath, "-out", certPath], { stdio: "ignore", timeout: 10000 });
  certificate = await readFile(certPath);
  siblingServer = createHttpsServer({ key: await readFile(keyPath), cert: certificate }, (_req, res) => {
    res.setHeader("content-type", "text/html"); res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Sibling fixture</body></html>');
  });
  siblingOrigin = `https://localhost:${await listen(siblingServer)}`;
  await symlink(join(web, "node_modules"), join(directory, "node_modules"), "dir");
  await mkdir(join(directory, "app/api/editor"), { recursive: true }); await writeFile(join(directory, "package.json"), '{"name":"isolated-text-editor-fixture","private":true}');
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2017", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx",
    esModuleInterop: true, skipLibCheck: true, paths: { "@/*": [`${source}/*`] } } }));
  await writeFile(join(directory, "next.config.mjs"), `export default { devIndicators: false, webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(source)}; return config; } };`);
  await writeFile(join(directory, "proxy.ts"), `
import { proxy as actualProxy } from ${JSON.stringify(join(source, "proxy"))};
export const proxy = actualProxy;
// Candidate topology only: production matcher and routes stay unchanged.
export const config = { matcher: ["/((?!api/editor$|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"] };
`);
  await mkdir(join(directory, "app/api/session"), { recursive: true });
  await writeFile(join(directory, "app/api/session/route.ts"), `
import { createClient } from ${JSON.stringify(join(source, "lib/supabase/server"))};
export const dynamic = "force-dynamic";
export async function GET() {
  const client = await createClient(); const { data, error } = await client.auth.getClaims();
  return Response.json(!error && data?.claims?.sub ? { subject: data.claims.sub } : { status: "unauthenticated" },
    { status: !error && data?.claims?.sub ? 200 : 401, headers: { "cache-control": "private, no-store" } });
}
`);
  await writeFile(join(directory, "app/api/editor/route.ts"), `
import assert from "node:assert/strict";
import { createBudgetedIdentityTextEditorHttpBoundary } from ${JSON.stringify(join(source, "lib/workspace/identity-text-editor-budget-http"))};
import { productClickBudgetScript } from ${JSON.stringify(join(source, "lib/public/product-click-budget"))};
export const dynamic = "force-dynamic";
const handle = createBudgetedIdentityTextEditorHttpBoundary({ trustedOrigin: ${JSON.stringify(nextOrigin)},
  policy: { namespace: "text-runtime", window_ms: 60000, command_limit: 100, work_limit: 1300 },
  upstash: { origin: "https://text-runtime.upstash.io", token: "isolated-budget-placeholder" } }, {
  key: new Uint8Array(32).fill(7), readTrustedMetadata: async () => ({ address: "192.0.2.1" }), fetcher: async (input, options) => {
    assert.equal(String(input), "https://text-runtime.upstash.io/"); assert.equal(JSON.parse(String(options.body))[1], productClickBudgetScript);
    const reply = await fetch(${JSON.stringify(providerOrigin + "/fixture-budget")}, options);
    return new Response(reply.body, { status: reply.status, headers: reply.headers });
  },
});
export async function POST(request: Request) {
  const result = await handle(request);
  const observed = await fetch(${JSON.stringify(providerOrigin + "/fixture-observation")}, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(1000),
    body: JSON.stringify({ origin: request.headers.get("origin"), site: request.headers.get("sec-fetch-site"),
      type: request.headers.get("content-type"), hasCookie: request.headers.has("cookie"), status: result.status }),
  });
  if (!observed.ok) throw new Error("Fixture observation failed");
  return result;
}
export async function GET() { return new Response('<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Editor fixture</body></html>', { headers: { "content-type": "text/html" } }); }
`);
  child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port),
    "--experimental-https", "--experimental-https-key", keyPath, "--experimental-https-cert", certPath], { cwd: directory, detached: true,
    stdio: ["ignore", "ignore", "ignore"], env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: providerOrigin, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey } });
  let spawnError; child.once("error", () => { spawnError = true; }); const deadline = performance.now() + 45000; let ready = false;
  while (performance.now() < deadline) {
    if (spawnError || child.exitCode !== null) throw new Error("isolated Text Next runtime failed to start");
    try { const r = await request(undefined, "", {}, "", "GET"); if (r.status === 200) { ready = true; break; }
      if (r.status === 500) throw new Error("isolated Text fixture compilation failed");
    } catch (error) { if (error.message === "isolated Text fixture compilation failed") throw error; }
    await delay(250);
  }
  assert.ok(ready, "isolated Text HTTPS runtime must become ready");
  // Candidate ingress fixture only. Real deployment must independently prove raw-target provenance.
  gatewayServer = createHttpsServer({ key: await readFile(keyPath), cert: certificate }, (incoming, outgoing) => {
    if (incoming.url !== "/api/editor") {
      gatewayRejections++;
      outgoing.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "private, no-store, max-age=0",
        pragma: "no-cache", expires: "0", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", connection: "close" });
      outgoing.end('{"status":"unavailable"}'); return;
    }
    gatewayForwards++;
    const upstream = httpsRequest(nextOrigin, { path: incoming.url, method: incoming.method, headers: incoming.headers,
      ca: certificate, family: 4, servername: "localhost", signal: AbortSignal.timeout(15000) }, response => {
      outgoing.writeHead(response.statusCode ?? 503, response.headers);
      response.on("error", () => outgoing.destroy()); response.pipe(outgoing);
    });
    upstream.on("error", () => {
      if (!outgoing.destroyed) { fixtureError = true; outgoing.destroy(); }
    });
    incoming.on("aborted", () => upstream.destroy());
    incoming.on("error", () => upstream.destroy());
    outgoing.on("close", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  gatewayPort = await listen(gatewayServer);
  cookieA = await encodeSession(subjects[0]); cookieB = await encodeSession(subjects[1]);
}, { timeout: 60000 });
beforeEach(() => { gatewayForwards = 0; gatewayRejections = 0; acceptRefresh = false; maximumDistinctSubjectsInFlight = 0; inFlightSubjects.clear(); authRequests = 0; refreshCalls = 0; models.clear(); calls = []; authCalls = 0; budgetCalls = 0; mutations = 0; events.length = 0; observations.length = 0;
  budgetResult = 1; restricted = false; malformedAck = false; fixtureError = undefined; });
after(async () => {
  if (child?.pid) { const exited = child.exitCode === null ? new Promise(resolve => child.once("exit", resolve)) : Promise.resolve();
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
    await Promise.race([exited, delay(2000)]); try { process.kill(-child.pid, "SIGKILL"); } catch { /* already stopped */ }
  }
  if (gatewayServer) { gatewayServer.closeAllConnections(); await new Promise(resolve => gatewayServer.close(resolve)); }
  if (siblingServer) { siblingServer.closeAllConnections(); await new Promise(resolve => siblingServer.close(resolve)); }
  if (provider) { provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("HTTPS requires the fixture CA with hostname verification", async () => {
  await assert.rejects(request(undefined, "", {}, "", "GET", false), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
  assert.equal(authCalls, 0); assert.equal(budgetCalls, 0);
});
for (const action of actions) test(`actual HTTPS ${action} uses one13-unit grant and guarded selected Text`, { timeout: 30000 }, async () => {
  if (action !== actions[0]) seed(subjects[0]); const value = command(action), r = check(await request(cookieA, value), 200);
  assert.equal(r.status, action === actions[0] ? "initialized" : action === actions[1] ? "allocated" : "saved");
  assert.equal(r.collection_revision, action === actions[0] ? 1 : 4); assert.equal(r.block_id, ids[0]);
  assert.equal(r.readback.status, "current"); assert.equal(r.readback.relation, "same_revision");
  assert.equal(r.readback.snapshot.current_handle, "fixture-owner-0"); assert.equal(r.readback.snapshot.block.is_visible, false);
  assert.deepEqual(r.readback.snapshot.block.text_working, { text: value.text_working.text });
  assert.equal(authCalls, 8); assert.equal(authRequests, 8); assert.equal(refreshCalls, 0); assert.equal(budgetCalls, 1); assert.equal(mutations, 1); assert.equal(events[0], "budget");
  const names = calls.map(c => c.name); for (const start of [6, 9]) {
    assert.deepEqual(names.slice(start, start + 2).sort(), [C, T].sort()); names.splice(start, 2, C, T);
  }
  assert.deepEqual(names, [S, S, action === actions[0] ? I : action === actions[1] ? A : W, S, S, S, C, T, S, C, T, S, S]);
  assert.ok(calls.every(c => c.subject === subjects[0]));
});
for (const reason of ["origin", "query", "json", "selector", "budget"]) test(`actual ${reason} denial before Auth/RPC`, async () => {
  if (reason === "budget") budgetResult = 0;
  const value = reason === "json" ? "{" : reason === "selector" ? { ...command(), owner_id: owners[1] } : command();
  check(await request(cookieA, value, reason === "origin" ? { origin: "https://evil.test" } : {}, reason === "query" ? "?other=1" : ""), 403, { status: "unavailable" });
  assert.equal(authCalls, 0); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0); assert.equal(calls.length, 0); assert.equal(budgetCalls, ["origin", "query"].includes(reason) ? 0 : 1);
});
for (const reason of ["missing", "forged", "header-only"]) test(`${reason} cookie cannot establish Owner`, async () => {
  check(await request(reason === "forged" ? `${cookieA.split("=")[0]}=bad` : undefined, command(),
    reason === "header-only" ? { authorization: `Bearer ${token(subjects[0])}` } : {}), 401, { status: "unauthenticated" });
  assert.equal(calls.length, 0); assert.equal(mutations, 0);
});
test("restricted Owner denies after cookie authentication without mutation", async () => {
  restricted = true; check(await request(cookieA), 403, { status: "restricted" }); assert.equal(mutations, 0); assert.equal(calls.length, 1);
});
for (const action of actions) test(`${action} conflict remains terminal without retry`, async () => {
  seed(subjects[0]); const value = command(action); if (action !== actions[0]) value.base_collection_revision = 2;
  check(await request(cookieA, value), 409, { status: action === actions[0] ? "already_initialized" : "stale_write" });
  assert.equal(mutations, 0); assert.equal(budgetCalls, 1);
});
test("unknown acknowledgment never emits private selected Text", async () => {
  malformedAck = true; check(await request(cookieA), 503, { status: "outcome_unknown" }); assert.equal(mutations, 1); assert.equal(calls.length, 3);
});
test("sequential subjects keep cookie principal and Working snapshot separate", async () => {
  const a = check(await request(cookieA), 200), b = check(await request(cookieB), 200);
  assert.equal(a.block_id, ids[0]); assert.equal(b.block_id, ids[1]); assert.equal(a.readback.snapshot.current_handle, "fixture-owner-0");
  assert.equal(b.readback.snapshot.current_handle, "fixture-owner-1"); assert.equal(authCalls, 16); assert.equal(mutations, 2);
});
test("concurrent subjects use separate request cookies and Owner models", async () => {
  const [a, b] = await Promise.all([request(cookieA), request(cookieB)]); assert.equal(check(a, 200).block_id, ids[0]); assert.equal(check(b, 200).block_id, ids[1]);
  for (const subject of subjects) assert.equal(calls.filter(c => c.subject === subject).length, 13); assert.equal(authCalls, 16); assert.equal(budgetCalls, 2);
});
test("missing-cookie after valid request cannot reuse prior principal", async () => {
  check(await request(cookieA), 200); const count = calls.length; check(await request(undefined), 401, { status: "unauthenticated" }); assert.equal(calls.length, count);
});
test("foreign selected save target is denied by controlled Owner model", async () => {
  seed(subjects[0]); const value = command(actions[2]); value.block_id = ids[1];
  check(await request(cookieA, value), 409, { status: "block_not_found" }); assert.equal(mutations, 0);
});
test("null Text remains raw Working data on save", async () => {
  seed(subjects[0]); const r = check(await request(cookieA, command(actions[2], null)), 200); assert.deepEqual(r.readback.snapshot.block.text_working, { text: null });
});

test("recognized cookie with provider signature mismatch cannot reach RPC", async () => {
  signingKey[0] ^= 255;
  try { check(await request(cookieA), 401, { status: "unauthenticated" }); assert.equal(calls.length, 0); assert.equal(mutations, 0); }
  finally { signingKey[0] ^= 255; }
});

async function browserSession(browser, cookie) {
  await browser.command("Network.clearBrowserCookies");
  if (cookie) await browser.command("Network.setCookies", { cookies: cookie.split("; ").map(pair => {
    const index = pair.indexOf("=");
    return { name: pair.slice(0, index), value: decodeURIComponent(pair.slice(index + 1)), url: nextOrigin,
      path: "/", secure: true, sameSite: "Lax" };
  }) });
}
async function navigate(browser, origin) {
  await browser.command("Page.navigate", { url: `${origin}/api/editor` });
  await until(() => browser.evaluate(`document.readyState === 'complete' && location.origin === ${JSON.stringify(origin)}`));
}
async function browserPost(browser, options = {}) {
  const reply = await browser.command("Runtime.evaluate", { awaitPromise: true, returnByValue: true,
    expression: `(async () => {
      const response = await fetch(${JSON.stringify(nextOrigin + (options.path ?? "/api/editor"))}, {
        method: "POST", credentials: "include", ${options.cross ? 'mode: "no-cors",' : ''}
        headers: { "content-type": ${JSON.stringify(options.cross ? "text/plain" : "application/json")} },
        body: ${JSON.stringify(JSON.stringify(options.value ?? command()))},
      });
      return ${options.cross ? '{ type: response.type, status: response.status }' : `{ status: response.status, cache: response.headers.get("cache-control"), body: await response.json(),
        privacy: { type: response.headers.get("content-type"), expires: response.headers.get("expires"), pragma: response.headers.get("pragma"),
          referrer: response.headers.get("referrer-policy"), nosniff: response.headers.get("x-content-type-options"),
          location: response.headers.has("location"), cors: response.headers.has("access-control-allow-origin"), authorization: response.headers.has("authorization") } }`};
    })()`,
  });
  assert.equal(reply.exceptionDetails, undefined, "actual browser fetch must settle without script error");
  assert.equal(fixtureError, undefined); return reply.result.value;
}
function fixturePin() {
  return createHash("sha256").update(new X509Certificate(certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
}
function checkBrowser(result, status) {
  assert.equal(result.status, status); assert.equal(result.cache, "private, no-store, max-age=0");
  assert.deepEqual(result.privacy, { type: "application/json; charset=utf-8", expires: "0", pragma: "no-cache",
    referrer: "no-referrer", nosniff: "nosniff", location: false, cors: false, authorization: false });
  return result.body;
}
test("actual Chromium rejects Text fixture certificate with unrelated SPKI", { timeout: 60000 }, async () => {
  const browser = await chromiumFixture({ certificateSpki: randomBytes(32).toString("base64") });
  try {
    await browser.command("Page.enable");
    const result = await browser.command("Page.navigate", { url: `${nextOrigin}/api/editor` });
    assert.equal(result.errorText, "net::ERR_CERT_AUTHORITY_INVALID");
    assert.equal(budgetCalls, 0); assert.equal(authCalls, 0); assert.deepEqual(calls, []); assert.deepEqual(observations, []);
  } finally { await browser.close(); }
});
for (const action of actions) test(`actual Chromium ${action} carries SSR cookie and selected raw hidden Text`, { timeout: 60000 }, async () => {
  if (action !== actions[0]) seed(subjects[0]);
  const browser = await chromiumFixture({ certificateSpki: fixturePin() });
  try {
    await browser.command("Page.enable"); await browser.command("Network.enable"); await navigate(browser, nextOrigin);
    await browserSession(browser, cookieA); const value = command(action);
    const result = checkBrowser(await browserPost(browser, { value }), 200);
    assert.equal(result.status, action === actions[0] ? "initialized" : action === actions[1] ? "allocated" : "saved");
    assert.equal(result.block_id, ids[0]); assert.equal(result.collection_revision, action === actions[0] ? 1 : 4);
    assert.equal(result.readback.status, "current"); assert.equal(result.readback.relation, "same_revision");
    assert.equal(result.readback.snapshot.current_handle, "fixture-owner-0"); assert.equal(result.readback.snapshot.block.is_visible, false);
    assert.deepEqual(result.readback.snapshot.block.text_working, { text: value.text_working.text });
    assert.deepEqual(observations, [{ origin: nextOrigin, site: "same-origin", type: "application/json", hasCookie: true, status: 200 }]);
    assert.equal(authCalls, 8); assert.equal(authRequests, 8); assert.equal(refreshCalls, 0); assert.equal(budgetCalls, 1); assert.equal(mutations, 1); assert.equal(events[0], "budget");
    const names = calls.map(c => c.name); for (const start of [6, 9]) {
      assert.deepEqual(names.slice(start, start + 2).sort(), [C, T].sort()); names.splice(start, 2, C, T);
    }
    assert.deepEqual(names, [S, S, action === actions[0] ? I : action === actions[1] ? A : W, S, S, S, C, T, S, C, T, S, S]);
    assert.ok(calls.every(c => c.subject === subjects[0]));
  } finally { await browser.close(); }
});
test("actual Chromium Text cookie replacement separates Owner and cookie loss denies further RPC", { timeout: 60000 }, async () => {
  const browser = await chromiumFixture({ certificateSpki: fixturePin() });
  try {
    await browser.command("Page.enable"); await browser.command("Network.enable"); await navigate(browser, nextOrigin);
    for (let i = 0; i < 2; i++) {
      await browserSession(browser, i ? cookieB : cookieA);
      const result = checkBrowser(await browserPost(browser, { value: command(actions[0], `Owner ${i}`) }), 200);
      assert.equal(result.status, "initialized"); assert.equal(result.block_id, ids[i]);
      assert.equal(result.readback.snapshot.current_handle, `fixture-owner-${i}`);
      assert.deepEqual(result.readback.snapshot.block.text_working, { text: `Owner ${i}` });
      assert.deepEqual(observations.at(-1), { origin: nextOrigin, site: "same-origin", type: "application/json", hasCookie: true, status: 200 });
      assert.equal(calls.filter(c => c.subject === subjects[i]).length, 13);
    }
    assert.equal(models.size, 2); assert.equal(authCalls, 16); assert.equal(budgetCalls, 2); assert.equal(mutations, 2);
    await browserSession(browser, undefined); const count = calls.length;
    assert.deepEqual(checkBrowser(await browserPost(browser), 401), { status: "unauthenticated" });
    assert.equal(calls.length, count); assert.equal(mutations, 2); assert.equal(authCalls, 16); assert.equal(budgetCalls, 3);
    assert.deepEqual(observations.at(-1), { origin: nextOrigin, site: "same-origin", type: "application/json", hasCookie: false, status: 401 });
  } finally { await browser.close(); }
});
for (const sameSite of [false, true]) test(`actual Chromium Text ${sameSite ? "same-site cross-origin" : "cross-site"} simple POST denies before budget/Auth/RPC`, { timeout: 60000 }, async () => {
  const browser = await chromiumFixture({ certificateSpki: fixturePin() });
  const origin = sameSite ? siblingOrigin : nextOrigin.replace("localhost", "127.0.0.1");
  try {
    await browser.command("Page.enable"); await browser.command("Network.enable"); await browserSession(browser, cookieA);
    await navigate(browser, origin);
    assert.deepEqual(await browserPost(browser, { cross: true }), { type: "opaque", status: 0 });
    assert.deepEqual(observations, [{ origin, site: sameSite ? "same-site" : "cross-site", type: "text/plain", hasCookie: sameSite, status: 403 }]);
    assert.equal(budgetCalls, 0); assert.equal(authCalls, 0); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0); assert.equal(mutations, 0);
    assert.deepEqual(calls, []); assert.deepEqual(events, []); assert.equal(models.size, 0);
  } finally { await browser.close(); }
});

test("Text candidate matcher retains actual Proxy on a separate control path", { timeout: 60000 }, async () => {
  async function control(cookie) {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(`${nextOrigin}/api/session`, { ca: certificate, family: 4,
        headers: { host: new URL(nextOrigin).host, ...(cookie ? { cookie } : {}) }, signal: AbortSignal.timeout(15000) }, res => {
        let raw = ""; res.setEncoding("utf8"); res.on("data", part => { raw += part;
          if (Buffer.byteLength(raw) > 4096) req.destroy(new Error("fixture control response too large")); });
        res.on("error", reject); res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw), headers: res.headers }); } catch (error) { reject(error); }
        });
      }); req.on("error", reject); req.end();
    });
  }
  for (let i = 0; i < 2; i++) {
    const valid = await control(i ? cookieB : cookieA);
    assert.equal(valid.status, 200); assert.deepEqual(valid.body, { subject: subjects[i] });
    assert.equal(valid.headers["cache-control"], "private, no-store"); assert.equal(valid.headers.location, undefined);
    assert.ok(valid.headers["content-security-policy"], "actual production Proxy must execute on control path");
    assert.equal(authRequests, (i + 1) * 2); assert.equal(authCalls, (i + 1) * 2);
  }
  assert.deepEqual(events, ["auth", "auth", "auth", "auth"]);
  const missing = await control(undefined);
  assert.equal(missing.status, 401); assert.deepEqual(missing.body, { status: "unauthenticated" });
  assert.equal(missing.headers["cache-control"], "private, no-store"); assert.ok(missing.headers["content-security-policy"]);
  assert.equal(authRequests, 4); assert.equal(refreshCalls, 0); assert.equal(budgetCalls, 0);
  assert.deepEqual(calls, []); assert.equal(mutations, 0); assert.equal(fixtureError, undefined);
});
test("expired Text cookie cannot refresh before metadata and distributed admission", { timeout: 60000 }, async () => {
  const expired = await encodeSession(subjects[0], 2); await delay(2100);
  // Issuance uses real Auth; only subsequent HTTP requests count as ordering evidence.
  authRequests = 0; authCalls = 0; refreshCalls = 0; events.length = 0;
  check(await request(expired, command(), { origin: "https://evil.test" }), 403, { status: "unavailable" });
  assert.deepEqual(events, []); assert.equal(authRequests, 0); assert.equal(budgetCalls, 0);
  budgetResult = 0; check(await request(expired), 403, { status: "unavailable" });
  assert.deepEqual(events, ["budget"]); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0);
  budgetResult = 1; const admitted = await request(expired); check(admitted, 401, { status: "unauthenticated" });
  assert.deepEqual(events, ["budget", "budget", "refresh"]);
  assert.equal(authRequests, 1); assert.equal(refreshCalls, 1); assert.equal(authCalls, 0); assert.equal(budgetCalls, 2);
  assert.deepEqual(calls, []); assert.equal(mutations, 0); assert.equal(models.size, 0);
  assert.ok(admitted.headers["set-cookie"]?.some(value => /max-age=0/i.test(value)), "actual SSR must clear rejected refresh cookie");
});

async function expiredSessions(selectedSubjects) {
  const cookies = await Promise.all(selectedSubjects.map(subject => encodeSession(subject, 2)));
  await delay(2100);
  // Exclude issuance overlap and Auth from subsequent HTTP lifecycle evidence.
  authRequests = 0; authCalls = 0; refreshCalls = 0; events.length = 0;
  maximumDistinctSubjectsInFlight = 0; inFlightSubjects.clear(); acceptRefresh = true;
  return cookies;
}
function responseSession(response) {
  const values = (response.headers["set-cookie"] ?? []).filter(value => value.startsWith("sb-") && !/max-age=0/i.test(value));
  assert.ok(values.length > 0, "actual Next route must return refreshed SSR cookie");
  return values.map(value => value.split(";")[0]).join("; ");
}
function selectedRefreshResult(result, action, i, text) {
  assert.equal(result.status, action === actions[0] ? "initialized" : action === actions[1] ? "allocated" : "saved");
  assert.equal(result.block_id, ids[i]); assert.equal(result.collection_revision, action === actions[0] ? 1 : 4);
  assert.equal(result.readback.status, "current"); assert.equal(result.readback.relation, "same_revision");
  assert.equal(result.readback.snapshot.current_handle, `fixture-owner-${i}`);
  assert.equal(result.readback.snapshot.block.is_visible, false);
  assert.deepEqual(result.readback.snapshot.block.text_working, { text });
  assert.ok(!/access_token|refresh_token/.test(JSON.stringify(result)), "session fields must remain outside response JSON");
}
function successfulRefreshCalls(action, subject) {
  assert.deepEqual(events.slice(0, 2), ["budget", "refresh"]);
  assert.equal(budgetCalls, 1); assert.equal(refreshCalls, 1); assert.equal(authRequests, 9); assert.equal(authCalls, 8);
  assert.equal(mutations, 1); assert.ok(calls.every(value => value.subject === subject));
  const names = calls.map(c => c.name); for (const start of [6, 9]) {
    assert.deepEqual(names.slice(start, start + 2).sort(), [C, T].sort()); names.splice(start, 2, C, T);
  }
  assert.deepEqual(names, [S, S, action === actions[0] ? I : action === actions[1] ? A : W, S, S, S, C, T, S, C, T, S, S]);
}
for (const action of actions) test(`successful Text ${action} refresh preserves private response session and explicit conflict truth`, { timeout: 60000 }, async () => {
  const [expired] = await expiredSessions([subjects[0]]);
  if (action !== actions[0]) seed(subjects[0]); const value = command(action);
  const response = await request(expired, value), result = check(response, 200);
  selectedRefreshResult(result, action, 0, value.text_working.text); successfulRefreshCalls(action, subjects[0]);
  const rotated = responseSession(response); assert.ok(rotated !== expired, "response must contain a new session cookie");
  // Separate explicit command; terminal RPC rejection is not an automatic retry or another commit.
  check(await request(rotated, value), 409, { status: action === actions[0] ? "already_initialized" : "stale_write" });
  assert.equal(refreshCalls, 1); assert.equal(budgetCalls, 2); assert.equal(mutations, 1);
  assert.ok(calls.every(value => value.subject === subjects[0]));
  assert.equal(models.get(subjects[0]).revision, action === actions[0] ? 1 : 4);
  assert.deepEqual(models.get(subjects[0]).block.text_working, { text: value.text_working.text });
});
test("successful Text refresh cannot override restricted Owner denial", { timeout: 60000 }, async () => {
  const [expired] = await expiredSessions([subjects[0]]); restricted = true;
  const response = await request(expired); check(response, 403, { status: "restricted" }); responseSession(response);
  assert.deepEqual(events, ["budget", "refresh", "auth", "rpc"]);
  assert.equal(refreshCalls, 1); assert.equal(budgetCalls, 1); assert.equal(authRequests, 2); assert.equal(authCalls, 1);
  assert.equal(mutations, 0); assert.equal(models.size, 0); assert.deepEqual(calls, [{ name: S, subject: subjects[0] }]);
});
test("concurrent expired Text sessions retain separate Owner data and replay response cookies", { timeout: 60000 }, async () => {
  const expired = await expiredSessions(subjects);
  const responses = await Promise.all(expired.map((cookie, i) => request(cookie, command(actions[0], `Refresh Owner ${i}`))));
  const rotated = responses.map(responseSession); assert.ok(rotated[0] !== rotated[1], "separate subjects need separate response cookies");
  for (let i = 0; i < 2; i++) {
    selectedRefreshResult(check(responses[i], 200), actions[0], i, `Refresh Owner ${i}`);
    const own = calls.filter(value => value.subject === subjects[i]); assert.equal(own.length, 13);
    assert.equal(own.filter(value => value.name === I).length, 1);
  }
  assert.equal(events[0], "budget"); assert.equal(refreshCalls, 2); assert.equal(budgetCalls, 2);
  assert.equal(authRequests, 18); assert.equal(authCalls, 16); assert.equal(mutations, 2);
  assert.ok(maximumDistinctSubjectsInFlight >= 2, "actual verified Auth for distinct subjects must overlap after issuance reset");
  await Promise.all(rotated.map(cookie => request(cookie).then(response => check(response, 409, { status: "already_initialized" }))));
  assert.equal(refreshCalls, 2); assert.equal(budgetCalls, 4); assert.equal(mutations, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(calls.filter(value => value.subject === subjects[i] && value.name === I).length, 2);
    assert.equal(models.get(subjects[i]).revision, 1);
    assert.deepEqual(models.get(subjects[i]).block.text_working, { text: `Refresh Owner ${i}` });
  }
  const prior = calls.length; check(await request(undefined), 401, { status: "unauthenticated" });
  assert.equal(calls.length, prior); assert.equal(refreshCalls, 2); assert.equal(mutations, 2);
});
for (const action of actions) test(`actual Chromium Text ${action} stores refreshed session naturally for explicit follow-up`, { timeout: 60000 }, async () => {
  const [expired] = await expiredSessions([subjects[0]]);
  if (action !== actions[0]) seed(subjects[0]); const value = command(action);
  const browser = await chromiumFixture({ certificateSpki: fixturePin() });
  try {
    await browser.command("Page.enable"); await browser.command("Network.enable");
    await browserSession(browser, expired); await navigate(browser, nextOrigin);
    const first = checkBrowser(await browserPost(browser, { value }), 200);
    selectedRefreshResult(first, action, 0, value.text_working.text); successfulRefreshCalls(action, subjects[0]);
    // Chromium applies real Next Set-Cookie; no cookie replacement between these explicit commands.
    const second = checkBrowser(await browserPost(browser, { value }), 409);
    assert.deepEqual(second, { status: action === actions[0] ? "already_initialized" : "stale_write" });
    assert.equal(refreshCalls, 1); assert.equal(budgetCalls, 2); assert.equal(mutations, 1);
    assert.ok(calls.every(value => value.subject === subjects[0]));
    assert.equal(models.get(subjects[0]).revision, action === actions[0] ? 1 : 4);
    assert.deepEqual(models.get(subjects[0]).block.text_working, { text: value.text_working.text });
    await browserSession(browser, undefined); const prior = calls.length;
    assert.deepEqual(checkBrowser(await browserPost(browser, { value }), 401), { status: "unauthenticated" });
    assert.equal(calls.length, prior); assert.equal(refreshCalls, 1); assert.equal(mutations, 1);
  } finally { await browser.close(); }
});

function noCommandIo() {
  assert.equal(fixtureError, undefined); assert.equal(budgetCalls, 0); assert.equal(authRequests, 0);
  assert.equal(refreshCalls, 0); assert.deepEqual(calls, []); assert.deepEqual(events, []); assert.equal(mutations, 0);
}
for (const path of ["/api/editor?", "/api/editor?x=1", "/api/../api/editor", "/api/./editor", "/api/%2e%2e/api/editor",
  "/api/editor/", "/api//editor", "/api/%65ditor", "/api/ed%69tor", "/api%2feditor", "/api/%2565ditor",
  "/api/EDITOR", "/api/editor.rsc", "/api/editor;extra"]) {
  test(`raw ingress denies ${path} before Next normalization and command I/O`, { timeout: 60000 }, async () => {
    check(await request(cookieA, command(), {}, "", "POST", true, { path, gateway: true }), 403, { status: "unavailable" });
    noCommandIo(); assert.equal(gatewayForwards, 0); assert.equal(gatewayRejections, 1); assert.deepEqual(observations, []);
  });
}
for (const path of ["/api/editor/", "/api//editor"]) {
  test(`direct Next redirect for ${path} remains internal and has no command I/O`, { timeout: 60000 }, async () => {
    const response = await request(cookieA, command(), {}, "", "POST", true, { path });
    assert.equal(response.status, 308); const location = new URL(response.headers.location, nextOrigin);
    assert.equal(location.origin, nextOrigin); assert.equal(location.pathname, "/api/editor");
    assert.equal(location.search, ""); assert.equal(location.hash, ""); assert.equal(response.headers["set-cookie"], undefined);
    noCommandIo(); assert.deepEqual(observations, []);
  });
}
for (const action of actions) test(`canonical Text ingress ${action} reaches guarded private Working`, { timeout: 60000 }, async () => {
  if (action !== actions[0]) seed(subjects[0]); const value = command(action);
  const result = check(await request(cookieA, value, {}, "", "POST", true, { path: "/api/editor", gateway: true }), 200);
  selectedRefreshResult(result, action, 0, value.text_working.text);
  assert.equal(gatewayForwards, 1); assert.equal(gatewayRejections, 0); assert.equal(budgetCalls, 1);
  assert.equal(authRequests, 8); assert.equal(authCalls, 8); assert.equal(refreshCalls, 0); assert.equal(mutations, 1);
  assert.equal(events[0], "budget"); assert.ok(calls.every(value => value.subject === subjects[0]));
  const names = calls.map(c => c.name); for (const start of [6, 9]) {
    assert.deepEqual(names.slice(start, start + 2).sort(), [C, T].sort()); names.splice(start, 2, C, T);
  }
  assert.deepEqual(names, [S, S, action === actions[0] ? I : action === actions[1] ? A : W, S, S, S, C, T, S, C, T, S, S]);
});
for (const reason of ["host", "host_port", "host_case", "origin", "forwarded_proto"]) {
  test(`canonical ingress ${reason} mismatch cannot be repaired by forwarded hints`, { timeout: 60000 }, async () => {
    const host = new URL(nextOrigin).host;
    const hints = { forwarded: `host=${host};proto=https`, "x-forwarded-host": host, "x-forwarded-proto": "https" };
    const headers = reason === "host" ? { ...hints, host: "evil.test" }
      : reason === "host_port" ? { ...hints, host: "localhost:1" }
      : reason === "host_case" ? { ...hints, host: host.toUpperCase() }
      : reason === "origin" ? { ...hints, origin: "https://evil.test" }
      : { "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" };
    check(await request(cookieA, command(), headers, "", "POST", true, { gateway: true }), 403, { status: "unavailable" });
    noCommandIo(); assert.equal(gatewayForwards, 1); assert.equal(gatewayRejections, 0);
  });
}
for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
  test(`canonical ingress ${method} never invokes editor command`, { timeout: 60000 }, async () => {
    const response = await request(cookieA, command(), {}, "", method, true, { gateway: true });
    assert.equal(response.status, method === "OPTIONS" ? 204 : 405); assert.equal(response.raw, "");
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    noCommandIo(); assert.equal(gatewayForwards, 1); assert.deepEqual(observations, []);
  });
}
test("canonical ingress forwarding never turns bearer or Owner hints into cookie authority", { timeout: 60000 }, async () => {
  const host = new URL(nextOrigin).host;
  const headers = { forwarded: `host=${host};proto=https`, "x-forwarded-host": host, "x-forwarded-proto": "https",
    authorization: `Bearer ${token(subjects[0])}`, "x-owner-id": owners[0] };
  check(await request(undefined, command(), headers, "", "POST", true, { gateway: true }), 401, { status: "unauthenticated" });
  assert.equal(gatewayForwards, 1); assert.equal(budgetCalls, 1); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0);
  assert.deepEqual(calls, []); assert.equal(mutations, 0);
});

test("raw ingress retains TLS CA and hostname verification before any HTTP I/O", { timeout: 60000 }, async () => {
  for (const wrongHostname of [false, true]) {
    await assert.rejects(new Promise((resolve, reject) => {
      const req = httpsRequest(nextOrigin, { port: gatewayPort, family: 4, servername: wrongHostname ? "wrong.example.test" : "localhost",
        ...(wrongHostname ? { ca: certificate } : {}), signal: AbortSignal.timeout(3000) }, resolve);
      req.on("error", reject); req.end();
    }), { code: wrongHostname ? "ERR_TLS_CERT_ALTNAME_INVALID" : "DEPTH_ZERO_SELF_SIGNED_CERT" });
  }
  noCommandIo(); assert.equal(gatewayForwards, 0); assert.equal(gatewayRejections, 0); assert.deepEqual(observations, []);
});
