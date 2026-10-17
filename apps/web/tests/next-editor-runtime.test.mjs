import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
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
let provider, child, directory, providerOrigin, nextOrigin, cookieA, cookieB, certificate;
let userCalls = 0, inFlight = 0, maximumInFlight = 0;
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
  const { error } = await client.auth.setSession({ access_token: token(subject, lifetime), refresh_token: "isolated-refresh-placeholder" });
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
  models.set(subject, { revision, rows: [row] });
  return malformedAck ? { status: "success", private_fixture_marker: "must-not-escape" }
    : { status: "success", block_id: blockIds[i], collection_revision: revision };
}
function request(cookie, value = command(), extraHeaders = {}, suffix = "", method = "POST") {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(`${nextOrigin}/api/editor${suffix}`, { method, ca: certificate, family: 4,
      headers: { origin: nextOrigin, "content-type": "application/json", "content-length": Buffer.byteLength(body),
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
      if (req.url === "/fixture-budget") {
        assert.equal(req.method, "POST"); assert.equal(req.headers.authorization, "Bearer isolated-budget-placeholder");
        let raw = ""; for await (const part of req) { raw += part; assert.ok(raw.length < 16384); }
        const wire = JSON.parse(raw); assert.equal(wire[0], "eval"); assert.equal(wire[2], 2); assert.equal(wire.length, 9);
        assert.match(wire[3], /^spall-identity-link-editor:editor-runtime:\{[0-9a-f]{64}\}:command$/);
        assert.equal(wire[4], wire[3].replace(/:command$/, ":work"));
        assert.deepEqual(wire.slice(5), ["60000", "100", "3100", "31"]);
        budgetCalls++; res.end(JSON.stringify({ result: budgetResult })); return;
      }
      if (req.method === "POST" && req.url === "/auth/v1/token?grant_type=refresh_token") {
        res.writeHead(400); res.end(JSON.stringify({ code: "refresh_token_not_found", message: "Fixture refresh denied" })); return;
      }
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
  await symlink(join(web, "node_modules"), join(directory, "node_modules"), "dir");
  await mkdir(join(directory, "app/api/editor"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "isolated-spall-editor-fixture", private: true }));
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2017", module: "esnext", moduleResolution: "bundler",
    jsx: "react-jsx", esModuleInterop: true, skipLibCheck: true, paths: { "@/*": [`${source}/*`] } } }));
  await writeFile(join(directory, "next.config.mjs"), `export default { devIndicators: false, webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(source)}; return config; } };`);
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
export async function POST(request: Request) { return handle(request); }
export async function GET() { return Response.json({ ready: true }); }
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
  cookieA = await encodeSession(subjects[0]); cookieB = await encodeSession(subjects[1]);
}, { timeout: 60000 });
beforeEach(() => {
  models.clear(); calls = []; userCalls = 0; budgetCalls = 0;
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
  if (child?.pid) {
    const exited = child.exitCode === null ? new Promise(resolve => child.once("exit", resolve)) : Promise.resolve();
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* process group already stopped */ }
    await Promise.race([exited, delay(2000)]);
    try { process.kill(-child.pid, "SIGKILL"); } catch { /* process group already stopped */ }
  }
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
    assert.deepEqual(calls.map(x => x.name), [S, S, action === "initialize_link_block" ? I : A, S, S, S, C, P, S, C, P, S, S]);
    assert.ok(calls.every(x => x.subject === subjects[0]));
  });
}
for (const reason of ["origin", "json", "selector", "budget"]) {
  test(`actual HTTPS ${reason} denial never reaches Auth or RPC`, { timeout: 60000 }, async () => {
    if (reason === "budget") budgetResult = 0;
    const value = reason === "json" ? "bad JSON" : reason === "selector" ? { ...command(), owner_id: owners[1] } : command();
    check(await request(cookieA, value, reason === "origin" ? { origin: "https://evil.test", "x-forwarded-host": new URL(nextOrigin).host } : {}), 403, { status: "unavailable" });
    assert.equal(userCalls, 0); assert.deepEqual(calls, []); assert.equal(budgetCalls, reason === "origin" ? 0 : 1);
  });
}
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
