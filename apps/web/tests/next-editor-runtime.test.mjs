import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, X509Certificate, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { chromiumFixture, until } from "./chromium-fixture.ts";
import { createServer as createHttpsServer, request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServerClient } from "@supabase/ssr";

const require = createRequire(import.meta.url);
const web = fileURLToPath(new URL("..", import.meta.url));
const source = resolve(web, "src");
const publicKey = "isolated-public-placeholder";
const signingKey = randomBytes(32);
const subjects = ["91000000-0000-4000-8000-000000000001", "91000000-0000-4000-8000-000000000002"];
let provider, child, directory, providerOrigin, nextOrigin, cookieA, cookieB, certificate, siblingServer, siblingOrigin;
let observations = [];
let gatewayServer, gatewayPort, gatewayForwards = 0, gatewayRejections = 0;
const refreshSubjects = new Map(); let acceptRefresh = false; let mutationCommits = 0;
let userCalls = 0, authRequests = 0, refreshCalls = 0, events = [], inFlight = 0, maximumInFlight = 0;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise((resolve, reject) => {
  server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
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

const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", P = "resolve_current_owner_blocks_working_page";
const I = "initialize_current_owner_blocks_from_link", A = "add_current_owner_link_block_working";
const owners = ["92000000-0000-4000-8000-000000000001", "92000000-0000-4000-8000-000000000002"];
const blockIds = ["93000000-0000-4000-8000-000000000001", "93000000-0000-4000-8000-000000000002"];
let calls = [], budgetCalls = 0, budgetResult = 1, malformedAck = false, restricted = false;
let fixtureError;
const models = new Map();
const command = (action = "initialize_link_block", label = " <Raw> 😀 ") => ({ action,
  base_collection_revision: action === "initialize_link_block" ? null : 3, is_visible: false,
  link_working: { kind: "generic_link", title: label, social_platform: null, destination_url: "javascript:private" } });
const context = i => ({ status: "success", current_handle: `fixture-owner-${i}`, primary_use_case: "personal" });
async function rpc(req, subject) {
  assert.equal(req.method, "POST"); assert.equal(req.headers["content-profile"], "api");
  const name = req.url.slice("/rest/v1/rpc/".length), i = subjects.indexOf(subject);
  assert.ok([S, C, P, I, A].includes(name));
  let raw = ""; for await (const part of req) { raw += part; assert.ok(raw.length <= 32768); }
  const body = JSON.parse(raw); calls.push({ name, subject });
  const model = models.get(subject);
  if (name === S) { assert.deepEqual(body, {}); return { status: restricted ? "restricted" : "active",
    owner_id: owners[i], account_state: restricted ? "restricted" : "active", onboarding_completed: true }; }
  if (name === C) { assert.deepEqual(body, {}); return context(i); }
  if (name === P) {
    assert.deepEqual(body, { input_request: { expected_collection_revision: null, after_position: null } });
    return { ...context(i), collection: model ? { revision: model.revision, blocks: model.rows, has_more: false, next_after_position: null } : null };
  }
  assert.deepEqual(Object.keys(body), ["input_intent"]);
  const value = body.input_intent;
  assert.deepEqual(Object.keys(value).sort(), ["action", "base_collection_revision", "is_visible", "link_working"]);
  assert.equal(value.action, name === I ? "initialize_link_block" : "add_link_block");
  if (name === I && model) return { status: "already_initialized" };
  if (name === A && (!model || model.revision !== value.base_collection_revision)) return { status: "stale_write" };
  const { kind, ...link_working } = value.link_working;
  const revision = name === I ? 1 : model.revision + 1;
  const row = { block_id: blockIds[i], kind, position: 1, is_visible: value.is_visible, payload_state: "present", link_working };
  models.set(subject, { revision, rows: [row] }); mutationCommits++;
  return malformedAck ? { status: "success", private_fixture_marker: "must-not-escape" }
    : { status: "success", block_id: blockIds[i], collection_revision: revision };
}
function request(cookie, value = command(), extraHeaders = {}, suffix = "", method = "POST", wire = {}) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(nextOrigin, { path: wire.path ?? `/api/editor${suffix}`, ...(wire.gateway ? { port: gatewayPort } : {}),
      method, ca: certificate, family: 4, servername: "localhost",
      headers: { host: new URL(nextOrigin).host, origin: nextOrigin, "content-type": "application/json", "content-length": Buffer.byteLength(body),
        ...(cookie ? { cookie } : {}), ...extraHeaders }, signal: AbortSignal.timeout(15000) }, res => {
      let raw = ""; res.setEncoding("utf8"); res.on("data", part => { raw += part; if (Buffer.byteLength(raw) > 4 * 1024 * 1024) req.destroy(new Error("fixture response too large")); });
      res.on("error", reject); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, raw }));
    });
    req.on("error", reject); req.end(body);
  });
}
function check(response, status, result) {
  assert.equal(fixtureError, undefined, "controlled provider must accept only expected wire contracts");
  assert.equal(response.status, status);
  assert.equal(response.headers["cache-control"], "private, no-store, max-age=0");
  assert.equal(response.headers["pragma"], "no-cache"); assert.equal(response.headers["expires"], "0");
  assert.equal(response.headers["referrer-policy"], "no-referrer"); assert.equal(response.headers["x-content-type-options"], "nosniff");
  for (const name of ["location", "access-control-allow-origin", "authorization"]) assert.equal(response.headers[name], undefined);
  const parsed = JSON.parse(response.raw); if (result) assert.deepEqual(parsed, result); return parsed;
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
        let raw = ""; for await (const part of req) { raw += part; assert.ok(raw.length < 16384); }
        const wire = JSON.parse(raw); assert.equal(wire[0], "eval"); assert.equal(wire[2], 2); assert.equal(wire.length, 9);
        assert.match(wire[3], /^spall-identity-link-editor:editor-runtime:\{[0-9a-f]{64}\}:command$/);
        assert.equal(wire[4], wire[3].replace(/:command$/, ":work"));
        assert.deepEqual(wire.slice(5), ["60000", "100", "3100", "31"]);
        events.push("budget"); budgetCalls++; res.end(JSON.stringify({ result: budgetResult })); return;
      }
      if (req.url.startsWith("/auth/v1/")) authRequests++;
      if (req.method === "POST" && req.url === "/auth/v1/token?grant_type=refresh_token") {
        events.push("refresh"); refreshCalls++;
        assert.equal(req.headers.apikey, publicKey);
        let raw = ""; for await (const part of req) { raw += part; assert.ok(Buffer.byteLength(raw) <= 4096); }
        const body = JSON.parse(raw); assert.deepEqual(Object.keys(body), ["refresh_token"]);
        const subject = refreshSubjects.get(body.refresh_token);
        if (!acceptRefresh || !subject) {
          res.writeHead(400); res.end(JSON.stringify({ code: "refresh_token_not_found", message: "Fixture refresh denied" })); return;
        }
        const rotated = `isolated-rotated-${randomBytes(16).toString("hex")}`; refreshSubjects.set(rotated, subject);
        res.end(JSON.stringify({ access_token: token(subject), refresh_token: rotated, token_type: "bearer", expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: subject, aud: "authenticated", role: "authenticated",
            email: "fixture@example.test", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" } })); return;
      }
      if (req.url === "/auth/v1/user") events.push("auth");
      if (req.url.startsWith("/rest/v1/rpc/")) events.push("rpc");
      assert.equal(req.headers.apikey, publicKey);
      const subject = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!subject) { res.writeHead(401); res.end(JSON.stringify({ code: "bad_jwt", message: "Fixture credential denied" })); return; }
      if (req.url.startsWith("/rest/v1/rpc/")) { res.end(JSON.stringify(await rpc(req, subject))); return; }
      assert.equal(req.method, "GET"); assert.equal(req.url, "/auth/v1/user");
      userCalls++; inFlight++; maximumInFlight = Math.max(maximumInFlight, inFlight); await delay(20); inFlight--;
      res.end(JSON.stringify({ id: subject, aud: "authenticated", role: "authenticated", email: "fixture@example.test",
        app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" }));
    } catch (error) {
      fixtureError = error; res.writeHead(500); res.end('{"status":"fixture_error"}');
    }
  });
  providerOrigin = `http://127.0.0.1:${await listen(provider)}`;
  const reservation = createServer(); const port = await listen(reservation); await new Promise(resolve => reservation.close(resolve));
  nextOrigin = `https://localhost:${port}`;
  directory = await mkdtemp(join(tmpdir(), "spall-next-editor-"));
  const keyPath = join(directory, "fixture-key.pem"), certPath = join(directory, "fixture-cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", keyPath, "-out", certPath], { stdio: "ignore", timeout: 10000 });
  certificate = await readFile(certPath);
  siblingServer = createHttpsServer({ key: await readFile(keyPath), cert: certificate }, (_req, res) => {
    res.setHeader("content-type", "text/html"); res.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Sibling fixture</body></html>');
  });
  siblingOrigin = `https://localhost:${await listen(siblingServer)}`;
  await symlink(join(web, "node_modules"), join(directory, "node_modules"), "dir");
  await mkdir(join(directory, "app/api/editor"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "isolated-spall-editor-fixture", private: true }));
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2017", module: "esnext", moduleResolution: "bundler",
    jsx: "react-jsx", esModuleInterop: true, skipLibCheck: true, paths: { "@/*": [`${source}/*`] } } }));
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
import { createBudgetedIdentityLinkEditorHttpBoundary } from ${JSON.stringify(join(source, "lib/workspace/identity-link-editor-budget-http"))};
import { productClickBudgetScript } from ${JSON.stringify(join(source, "lib/public/product-click-budget"))};
export const dynamic = "force-dynamic";
const handle = createBudgetedIdentityLinkEditorHttpBoundary({ trustedOrigin: ${JSON.stringify(nextOrigin)},
  policy: { namespace: "editor-runtime", window_ms: 60000, command_limit: 100, work_limit: 3100 },
  upstash: { origin: "https://editor-runtime.upstash.io", token: "isolated-budget-placeholder" } }, {
  key: new Uint8Array(32).fill(7), readTrustedMetadata: async () => ({ address: "192.0.2.1" }),
  fetcher: async (input, options) => {
    assert.equal(String(input), "https://editor-runtime.upstash.io/");
    assert.equal(JSON.parse(String(options.body))[1], productClickBudgetScript);
    const reply = await fetch(${JSON.stringify(providerOrigin + "/fixture-budget")}, options);
    // Controlled transport returns a synthetic provider Response; no live Upstash URL assertion.
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
    "--experimental-https", "--experimental-https-key", keyPath, "--experimental-https-cert", certPath], {
    cwd: directory, detached: true, stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: providerOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey },
  });
  let spawnError; child.once("error", error => { spawnError = error; });
  const startupDeadline = performance.now() + 45000; let ready = false;
  while (performance.now() < startupDeadline) {
    if (spawnError || child.exitCode !== null) throw new Error("isolated Next runtime failed to start");
    try {
      const response = await request(undefined, "", {}, "", "GET");
      if (response.status === 200) { ready = true; break; }
      if (response.status === 500) throw new Error("isolated Next fixture compilation failed");
    } catch (error) { if (error.message === "isolated Next fixture compilation failed") throw error; }
    await delay(250);
  }
  assert.ok(ready, "isolated HTTPS Next runtime must become ready before deadline");
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
      if (!outgoing.destroyed) { fixtureError = new Error("Fixture gateway upstream failed"); outgoing.destroy(); }
    });
    incoming.on("aborted", () => upstream.destroy());
    incoming.on("error", () => upstream.destroy());
    outgoing.on("close", () => upstream.destroy());
    incoming.pipe(upstream);
  });
  gatewayPort = await listen(gatewayServer);
  cookieA = await encodeSession(subjects[0]); cookieB = await encodeSession(subjects[1]);
}, { timeout: 60000 });
beforeEach(() => {
  models.clear(); observations = []; calls = []; userCalls = 0; budgetCalls = 0;
  gatewayForwards = 0; gatewayRejections = 0;
  authRequests = 0; refreshCalls = 0; events = [];
  acceptRefresh = false; mutationCommits = 0; refreshSubjects.clear();
  budgetResult = 1; malformedAck = false; restricted = false; fixtureError = undefined; maximumInFlight = 0;
});
test("HTTPS fixture requires its explicit CA and retains certificate verification", { timeout: 60000 }, async () => {
  await assert.rejects(new Promise((resolve, reject) => {
    const req = httpsRequest(`${nextOrigin}/api/editor`, { family: 4, signal: AbortSignal.timeout(3000) }, resolve);
    req.on("error", reject); req.end();
  }), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
  assert.equal(userCalls, 0); assert.equal(budgetCalls, 0); assert.deepEqual(calls, []);
});
after(async () => {
  if (gatewayServer) { gatewayServer.closeAllConnections(); await new Promise(resolve => gatewayServer.close(resolve)); }
  if (child?.pid) {
    const exited = child.exitCode === null ? new Promise(resolve => child.once("exit", resolve)) : Promise.resolve();
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* process group already stopped */ }
    await Promise.race([exited, delay(2000)]);
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* process group already stopped */ }
  }
  if (siblingServer) { siblingServer.closeAllConnections(); await new Promise(resolve => siblingServer.close(resolve)); }
  if (provider) { provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve)); }
  if (directory) await rm(directory, { recursive: true, force: true });
});

for (const action of ["initialize_link_block", "add_link_block"]) {
  test(`actual HTTPS ${action} binds cookie principal, guarded Owner/RPC and private Working readback`, { timeout: 60000 }, async () => {
    if (action === "add_link_block") models.set(subjects[0], { revision: 3, rows: [] });
    const value = command(action), response = await request(cookieA, value), body = check(response, 200);
    assert.equal(body.status, action === "initialize_link_block" ? "initialized" : "allocated");
    assert.equal(body.block_id, blockIds[0]); assert.equal(body.collection_revision, action === "initialize_link_block" ? 1 : 4);
    assert.equal(body.readback.status, "current"); assert.equal(body.readback.relation, "same_revision");
    assert.equal(body.readback.snapshot.current_handle, "fixture-owner-0");
    const row = body.readback.snapshot.collection.blocks[0];
    assert.equal(row.is_visible, false); assert.deepEqual(row.link_working, { title: value.link_working.title, social_platform: null, destination_url: "javascript:private" });
    assert.deepEqual(row.issues, [{ field: "destination_url", code: "destination_invalid" }]);
    assert.equal(budgetCalls, 1); assert.equal(userCalls, 8);
    assert.equal(authRequests, 8); assert.equal(refreshCalls, 0);
    assert.equal(events[0], "budget"); assert.equal(events.filter(x => x === "budget").length, 1);
    const names = calls.map(x => x.name);
    for (const start of [6, 9]) {
      assert.deepEqual(names.slice(start, start + 2).sort(), [C, P].sort()); names.splice(start, 2, C, P);
    }
    assert.deepEqual(names, [S, S, action === "initialize_link_block" ? I : A, S, S, S, C, P, S, C, P, S, S]);
    assert.ok(calls.every(x => x.subject === subjects[0]));
  });
}
for (const reason of ["origin", "query", "json", "selector", "budget"]) {
  test(`actual HTTPS ${reason} denial never reaches Auth or RPC`, { timeout: 60000 }, async () => {
    if (reason === "budget") budgetResult = 0;
    const value = reason === "json" ? "bad JSON" : reason === "selector" ? { ...command(), owner_id: owners[1] } : command();
    const metadataDenied = reason === "origin" || reason === "query";
    check(await request(cookieA, value, reason === "origin" ? { origin: "https://evil.test", "x-forwarded-host": new URL(nextOrigin).host } : {},
      reason === "query" ? "?untrusted=1" : ""), 403, { status: "unavailable" });
    assert.equal(userCalls, 0); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0);
    assert.deepEqual(events, metadataDenied ? [] : ["budget"]);
    assert.deepEqual(calls, []); assert.equal(budgetCalls, metadataDenied ? 0 : 1);
  });
}
test("candidate matcher retains actual Proxy authentication on a separate control path", { timeout: 60000 }, async () => {
  async function control(cookie) {
    return new Promise((resolve, reject) => {
      const req = httpsRequest(`${nextOrigin}/api/session`, { ca: certificate, family: 4,
        headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(15000) }, res => {
        let raw = ""; res.setEncoding("utf8"); res.on("data", part => { raw += part;
          if (Buffer.byteLength(raw) > 4096) req.destroy(new Error("fixture control response too large")); });
        res.on("error", reject); res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw), headers: res.headers }); } catch (error) { reject(error); }
        });
      });
      req.on("error", reject); req.end();
    });
  }
  const valid = await control(cookieA);
  assert.equal(valid.status, 200); assert.deepEqual(valid.body, { subject: subjects[0] });
  assert.ok(valid.headers["content-security-policy"], "actual production Proxy must execute on control path");
  assert.equal(authRequests, 2); assert.equal(userCalls, 2); assert.deepEqual(events, ["auth", "auth"]);
  const missing = await control(undefined);
  assert.equal(missing.status, 401); assert.deepEqual(missing.body, { status: "unauthenticated" });
  assert.equal(authRequests, 2); assert.equal(budgetCalls, 0); assert.deepEqual(calls, []); assert.equal(fixtureError, undefined);
});
test("expired cookie cannot refresh before editor metadata and budget admission", { timeout: 60000 }, async () => {
  const expired = await encodeSession(subjects[0], 2);
  await delay(2100);
  // Issuance itself validates through Auth. Observe only the subsequent HTTP lifecycle.
  authRequests = 0; userCalls = 0; refreshCalls = 0; events = [];
  check(await request(expired, command(), { origin: "https://evil.test" }), 403, { status: "unavailable" });
  assert.deepEqual(events, []); assert.equal(authRequests, 0); assert.equal(budgetCalls, 0);
  budgetResult = 0;
  check(await request(expired), 403, { status: "unavailable" });
  assert.deepEqual(events, ["budget"]); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0);
  budgetResult = 1;
  const admitted = await request(expired);
  check(admitted, 401, { status: "unauthenticated" });
  assert.deepEqual(events, ["budget", "budget", "refresh"]);
  assert.equal(authRequests, 1); assert.equal(refreshCalls, 1); assert.equal(userCalls, 0);
  assert.equal(budgetCalls, 2); assert.deepEqual(calls, []); assert.equal(models.size, 0);
  assert.ok(admitted.headers["set-cookie"]?.some(value => /max-age=0/i.test(value)), "actual route SSR must clear rejected refresh cookie");
});
async function expiredSessions(selectedSubjects) {
  const cookies = await Promise.all(selectedSubjects.map(subject => encodeSession(subject, 2)));
  await delay(2100);
  authRequests = 0; userCalls = 0; refreshCalls = 0; events = []; maximumInFlight = 0;
  acceptRefresh = true; return cookies;
}
function responseSession(response) {
  const values = (response.headers["set-cookie"] ?? []).filter(value => value.startsWith("sb-") && !/max-age=0/i.test(value));
  assert.ok(values.length > 0, "actual Next route must return refreshed SSR cookie");
  return values.map(value => value.split(";")[0]).join("; ");
}
for (const action of ["initialize_link_block", "add_link_block"]) {
  test(`successful editor ${action} refresh follows budget and preserves private response cookies`, { timeout: 60000 }, async () => {
    const [expired] = await expiredSessions([subjects[0]]);
    if (action === "add_link_block") models.set(subjects[0], { revision: 3, rows: [] });
    const response = await request(expired, command(action)), result = check(response, 200);
    assert.equal(result.status, action === "initialize_link_block" ? "initialized" : "allocated");
    assert.equal(result.readback.snapshot.current_handle, "fixture-owner-0");
    assert.equal(result.readback.snapshot.collection.blocks[0].is_visible, false);
    assert.equal(result.readback.snapshot.collection.blocks[0].link_working.destination_url, "javascript:private");
    assert.deepEqual(events.slice(0, 2), ["budget", "refresh"]);
    assert.equal(budgetCalls, 1); assert.equal(refreshCalls, 1); assert.equal(authRequests, 9); assert.equal(userCalls, 8);
    assert.equal(mutationCommits, 1); assert.equal(calls.length, 13); assert.ok(calls.every(value => value.subject === subjects[0]));
    assert.ok(!/access_token|refresh_token/.test(response.raw));
    const rotated = responseSession(response); assert.ok(rotated !== expired, "response must contain a new session cookie");
    // A separate explicit command is allowed to reach the same fixed RPC and reject; it must not commit again.
    check(await request(rotated, command(action)), 409, { status: action === "initialize_link_block" ? "already_initialized" : "stale_write" });
    assert.equal(refreshCalls, 1); assert.equal(budgetCalls, 2); assert.equal(mutationCommits, 1);
    assert.equal(models.get(subjects[0]).revision, action === "initialize_link_block" ? 1 : 4);
  });
}
test("successful editor refresh never overrides restricted Owner denial", { timeout: 60000 }, async () => {
  const [expired] = await expiredSessions([subjects[0]]); restricted = true;
  const response = await request(expired); check(response, 403, { status: "restricted" }); responseSession(response);
  assert.deepEqual(events, ["budget", "refresh", "auth", "rpc"]);
  assert.equal(refreshCalls, 1); assert.equal(budgetCalls, 1); assert.equal(authRequests, 2);
  assert.equal(mutationCommits, 0); assert.equal(models.size, 0); assert.deepEqual(calls.map(value => value.name), [S]);
});
test("concurrent expired editor sessions retain separate Owner data and replay cookies without refresh", { timeout: 60000 }, async () => {
  const expired = await expiredSessions(subjects);
  const responses = await Promise.all(expired.map((cookie, i) => request(cookie, command("initialize_link_block", `refresh-owner-${i}`))));
  const rotated = responses.map(responseSession);
  assert.ok(rotated[0] !== rotated[1], "different subjects must return separate response sessions");
  for (let i = 0; i < 2; i++) {
    const result = check(responses[i], 200); assert.equal(result.block_id, blockIds[i]);
    assert.equal(result.readback.snapshot.current_handle, `fixture-owner-${i}`);
    assert.equal(result.readback.snapshot.collection.blocks[0].link_working.title, `refresh-owner-${i}`);
    assert.equal(calls.filter(value => value.subject === subjects[i] && value.name === I).length, 1);
  }
  assert.equal(refreshCalls, 2); assert.equal(budgetCalls, 2); assert.equal(authRequests, 18); assert.equal(userCalls, 16);
  assert.equal(mutationCommits, 2); assert.ok(maximumInFlight >= 2);
  await Promise.all(rotated.map(cookie => request(cookie).then(response => check(response, 409, { status: "already_initialized" }))));
  assert.equal(refreshCalls, 2); assert.equal(budgetCalls, 4); assert.equal(mutationCommits, 2);
  for (const subject of subjects) assert.equal(calls.filter(value => value.subject === subject && value.name === I).length, 2);
  const prior = calls.length; check(await request(undefined), 401, { status: "unauthenticated" });
  assert.equal(calls.length, prior); assert.equal(refreshCalls, 2);
});
test("missing and forged cookies cannot use Authorization/Owner hints to reach RPC", { timeout: 60000 }, async () => {
  for (const cookie of [undefined, cookieA.split("=")[0] + "=invalid"]) {
    check(await request(cookie, command(), { authorization: `Bearer ${token(subjects[0])}`, "x-owner-id": owners[0] }), 401, { status: "unauthenticated" });
  }
  assert.deepEqual(calls, []); assert.equal(userCalls, 0); assert.equal(budgetCalls, 2);
});
test("restricted Owner is denied after cookie verification without mutation", { timeout: 60000 }, async () => {
  restricted = true; check(await request(cookieA), 403, { status: "restricted" });
  assert.deepEqual(calls.map(x => x.name), [S]); assert.equal(models.size, 0);
});
test("stale addition and already-initialized stay terminal without fallback", { timeout: 60000 }, async () => {
  models.set(subjects[0], { revision: 2, rows: [] });
  check(await request(cookieA, command("add_link_block")), 409, { status: "stale_write" });
  check(await request(cookieA), 409, { status: "already_initialized" });
  assert.deepEqual(calls.map(x => x.name), [S, S, A, S, S, I]); assert.equal(models.get(subjects[0]).revision, 2);
});
test("unknown mutation acknowledgment is status-only and never implies rollback", { timeout: 60000 }, async () => {
  malformedAck = true; check(await request(cookieA), 503, { status: "outcome_unknown" });
  assert.deepEqual(calls.map(x => x.name), [S, S, I]); assert.equal(models.get(subjects[0]).revision, 1);
});
test("concurrent HTTPS cookies retain distinct Owner Working data, then missing cookie stays denied", { timeout: 60000 }, async () => {
  const values = [command("initialize_link_block", "owner A"), command("initialize_link_block", "owner B")];
  const responses = await Promise.all([request(cookieA, values[0]), request(cookieB, values[1])]);
  for (let i = 0; i < 2; i++) {
    const body = check(responses[i], 200); assert.equal(body.block_id, blockIds[i]);
    assert.equal(body.readback.snapshot.current_handle, `fixture-owner-${i}`);
    assert.equal(body.readback.snapshot.collection.blocks[0].link_working.title, values[i].link_working.title);
    assert.equal(calls.filter(x => x.subject === subjects[i] && x.name === I).length, 1);
  }
  assert.ok(maximumInFlight >= 2); assert.equal(budgetCalls, 2);
  const before = calls.length; check(await request(undefined), 401, { status: "unauthenticated" }); assert.equal(calls.length, before);
});
test("sequential HTTPS requests change cookie principal without carrying prior Owner state", { timeout: 60000 }, async () => {
  for (let i = 0; i < 2; i++) {
    const body = check(await request(i ? cookieB : cookieA, command("initialize_link_block", `sequential-${i}`)), 200);
    assert.equal(body.block_id, blockIds[i]); assert.equal(body.readback.snapshot.current_handle, `fixture-owner-${i}`);
    assert.equal(body.readback.snapshot.collection.blocks[0].link_working.title, `sequential-${i}`);
  }
  assert.equal(models.size, 2); assert.equal(budgetCalls, 2);
  const before = calls.length; check(await request(undefined), 401, { status: "unauthenticated" }); assert.equal(calls.length, before);
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
      const response = await fetch(${JSON.stringify(nextOrigin + "/api/editor")}, {
        method: "POST", credentials: "include", ${options.cross ? 'mode: "no-cors",' : ''}
        headers: { "content-type": ${JSON.stringify(options.cross ? "text/plain" : "application/json")} },
        body: ${JSON.stringify(JSON.stringify(command()))},
      });
      return ${options.cross ? '{ type: response.type, status: response.status }' : '{ status: response.status, cache: response.headers.get("cache-control"), body: await response.json() }'};
    })()`,
  });
  assert.equal(reply.exceptionDetails, undefined, "actual browser fetch must settle without script error");
  assert.equal(fixtureError, undefined); return reply.result.value;
}
function fixturePin() {
  return createHash("sha256").update(new X509Certificate(certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
}
test("actual Chromium rejects the fixture certificate when only an unrelated SPKI is trusted", { timeout: 60000 }, async () => {
  const browser = await chromiumFixture({ certificateSpki: randomBytes(32).toString("base64") });
  try {
    await browser.command("Page.enable");
    const result = await browser.command("Page.navigate", { url: `${nextOrigin}/api/editor` });
    assert.equal(result.errorText, "net::ERR_CERT_AUTHORITY_INVALID");
    assert.equal(budgetCalls, 0); assert.equal(userCalls, 0); assert.deepEqual(calls, []); assert.deepEqual(observations, []);
  } finally { await browser.close(); }
});
test("actual Chromium attaches SSR cookies to same-origin editor POST, switches Owner and denies cookie loss", { timeout: 60000 }, async () => {
  const browser = await chromiumFixture({ certificateSpki: fixturePin() });
  try {
    await browser.command("Page.enable"); await browser.command("Network.enable"); await navigate(browser, nextOrigin);
    for (let i = 0; i < 2; i++) {
      await browserSession(browser, i ? cookieB : cookieA);
      const result = await browserPost(browser);
      assert.equal(result.status, 200); assert.equal(result.cache, "private, no-store, max-age=0");
      assert.equal(result.body.status, "initialized"); assert.equal(result.body.block_id, blockIds[i]);
      assert.equal(result.body.readback.snapshot.current_handle, `fixture-owner-${i}`);
      assert.deepEqual(observations.at(-1), { origin: nextOrigin, site: "same-origin", type: "application/json", hasCookie: true, status: 200 });
    }
    assert.equal(budgetCalls, 2); assert.equal(calls.filter(x => x.name === I).length, 2);
    await browserSession(browser, undefined); const before = calls.length;
    const result = await browserPost(browser); assert.equal(result.status, 401); assert.deepEqual(result.body, { status: "unauthenticated" });
    assert.equal(calls.length, before); assert.equal(observations.at(-1).hasCookie, false);
  } finally { await browser.close(); }
});
for (const sameSite of [false, true]) {
  test(`actual Chromium ${sameSite ? "same-site cross-origin" : "cross-site"} simple POST is denied before budget/Auth/RPC`, { timeout: 60000 }, async () => {
    const browser = await chromiumFixture({ certificateSpki: fixturePin() });
    const origin = sameSite ? siblingOrigin : nextOrigin.replace("localhost", "127.0.0.1");
    try {
      await browser.command("Page.enable"); await browser.command("Network.enable"); await browserSession(browser, cookieA);
      await navigate(browser, origin);
      assert.deepEqual(await browserPost(browser, { cross: true }), { type: "opaque", status: 0 });
      assert.deepEqual(observations, [{ origin, site: sameSite ? "same-site" : "cross-site", type: "text/plain", hasCookie: sameSite, status: 403 }]);
      assert.equal(budgetCalls, 0); assert.equal(userCalls, 0); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0);
      assert.deepEqual(events, []); assert.deepEqual(calls, []); assert.equal(models.size, 0);
    } finally { await browser.close(); }
  });
}

test("actual Chromium stores editor refresh Set-Cookie and reuses it on a separate explicit command", { timeout: 60000 }, async () => {
  const [expired] = await expiredSessions([subjects[0]]);
  const browser = await chromiumFixture({ certificateSpki: fixturePin() });
  try {
    await browser.command("Page.enable"); await browser.command("Network.enable");
    await browserSession(browser, expired); await navigate(browser, nextOrigin);
    const first = await browserPost(browser);
    assert.equal(first.status, 200); assert.equal(first.cache, "private, no-store, max-age=0");
    assert.equal(first.body.status, "initialized"); assert.equal(first.body.readback.snapshot.current_handle, "fixture-owner-0");
    assert.deepEqual(events.slice(0, 2), ["budget", "refresh"]);
    assert.equal(refreshCalls, 1); assert.equal(authRequests, 9); assert.equal(budgetCalls, 1); assert.equal(mutationCommits, 1);
    // No CDP cookie replacement between requests: Chromium must apply the real response Set-Cookie.
    const second = await browserPost(browser);
    assert.equal(second.status, 409); assert.deepEqual(second.body, { status: "already_initialized" });
    assert.equal(second.cache, "private, no-store, max-age=0");
    assert.equal(refreshCalls, 1); assert.equal(budgetCalls, 2); assert.equal(mutationCommits, 1);
    assert.ok(calls.every(value => value.subject === subjects[0]));
    await browserSession(browser, undefined); const prior = calls.length;
    assert.equal((await browserPost(browser)).status, 401); assert.equal(calls.length, prior);
    assert.equal(refreshCalls, 1);
  } finally { await browser.close(); }
});

function noCommandIo() {
  assert.equal(fixtureError, undefined); assert.equal(budgetCalls, 0); assert.equal(authRequests, 0);
  assert.equal(refreshCalls, 0); assert.deepEqual(calls, []); assert.deepEqual(events, []); assert.equal(mutationCommits, 0);
}
for (const path of ["/api/editor?", "/api/editor?x=1", "/api/../api/editor", "/api/./editor", "/api/%2e%2e/api/editor",
  "/api/editor/", "/api//editor", "/api/%65ditor", "/api/ed%69tor", "/api%2feditor", "/api/%2565ditor",
  "/api/EDITOR", "/api/editor.rsc", "/api/editor;extra"]) {
  test(`raw ingress denies ${path} before Next normalization and command I/O`, { timeout: 60000 }, async () => {
    check(await request(cookieA, command(), {}, "", "POST", { path, gateway: true }), 403, { status: "unavailable" });
    noCommandIo(); assert.equal(gatewayForwards, 0); assert.equal(gatewayRejections, 1); assert.deepEqual(observations, []);
  });
}
for (const path of ["/api/editor/", "/api//editor"]) {
  test(`direct Next redirect for ${path} remains internal and has no command I/O`, { timeout: 60000 }, async () => {
    const response = await request(cookieA, command(), {}, "", "POST", { path });
    assert.equal(response.status, 308); const location = new URL(response.headers.location, nextOrigin);
    assert.equal(location.origin, nextOrigin); assert.equal(location.pathname, "/api/editor");
    assert.equal(location.search, ""); assert.equal(location.hash, ""); assert.equal(response.headers["set-cookie"], undefined);
    noCommandIo(); assert.deepEqual(observations, []);
  });
}
test("canonical raw ingress reaches actual budget, cookie Owner and private Working response", { timeout: 60000 }, async () => {
  const response = await request(cookieA, command(), {}, "", "POST", { path: "/api/editor", gateway: true });
  const result = check(response, 200); assert.equal(result.status, "initialized");
  assert.equal(result.readback.snapshot.current_handle, "fixture-owner-0");
  assert.equal(result.readback.snapshot.collection.blocks[0].link_working.destination_url, "javascript:private");
  assert.equal(gatewayForwards, 1); assert.equal(gatewayRejections, 0); assert.equal(budgetCalls, 1);
  assert.equal(authRequests, 8); assert.equal(refreshCalls, 0); assert.equal(calls.length, 13); assert.equal(mutationCommits, 1);
  assert.equal(events[0], "budget"); assert.ok(calls.every(value => value.subject === subjects[0]));
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
    check(await request(cookieA, command(), headers, "", "POST", { gateway: true }), 403, { status: "unavailable" });
    noCommandIo(); assert.equal(gatewayForwards, 1); assert.equal(gatewayRejections, 0);
  });
}
for (const method of ["PUT", "PATCH", "DELETE", "OPTIONS"]) {
  test(`canonical ingress ${method} never invokes editor command`, { timeout: 60000 }, async () => {
    const response = await request(cookieA, command(), {}, "", method, { gateway: true });
    assert.equal(response.status, method === "OPTIONS" ? 204 : 405); assert.equal(response.raw, "");
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    noCommandIo(); assert.equal(gatewayForwards, 1); assert.deepEqual(observations, []);
  });
}
test("canonical ingress forwarding never turns bearer or Owner hints into cookie authority", { timeout: 60000 }, async () => {
  const host = new URL(nextOrigin).host;
  const headers = { forwarded: `host=${host};proto=https`, "x-forwarded-host": host, "x-forwarded-proto": "https",
    authorization: `Bearer ${token(subjects[0])}`, "x-owner-id": owners[0] };
  check(await request(undefined, command(), headers, "", "POST", { gateway: true }), 401, { status: "unauthenticated" });
  assert.equal(gatewayForwards, 1); assert.equal(budgetCalls, 1); assert.equal(authRequests, 0); assert.equal(refreshCalls, 0);
  assert.deepEqual(calls, []); assert.equal(mutationCommits, 0);
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
