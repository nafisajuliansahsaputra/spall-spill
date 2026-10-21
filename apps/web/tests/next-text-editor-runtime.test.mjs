import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServerClient } from "@supabase/ssr";

const require = createRequire(import.meta.url), web = fileURLToPath(new URL("..", import.meta.url)), source = resolve(web, "src");
const publicKey = "isolated-public-placeholder", signingKey = randomBytes(32), refreshSubjects = new Map();
const subjects = ["91000000-0000-4000-8000-000000000001", "91000000-0000-4000-8000-000000000002"];
const owners = ["92000000-0000-4000-8000-000000000001", "92000000-0000-4000-8000-000000000002"];
const ids = ["93000000-0000-4000-8000-000000000001", "93000000-0000-4000-8000-000000000002"];
let provider, child, directory, providerOrigin, nextOrigin, certificate, cookieA, cookieB;
let calls = [], authCalls = 0, budgetCalls = 0, mutations = 0, budgetResult = 1, restricted = false, malformedAck = false, fixtureError;
const models = new Map(), events = [];
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
function request(cookie, value = command(), headers = {}, suffix = "", method = "POST", trust = true) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(nextOrigin, { path: `/api/editor${suffix}`, method, ...(trust ? { ca: certificate } : {}), family: 4, servername: "localhost",
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
      if (req.url === "/fixture-budget") {
        assert.equal(req.method, "POST"); assert.equal(req.headers.authorization, "Bearer isolated-budget-placeholder");
        const wire = await body(req); assert.equal(wire.length, 9); assert.equal(wire[0], "eval"); assert.equal(wire[2], 2);
        assert.match(wire[3], /^spall-identity-text-editor:text-runtime:\{[a-f0-9]{64}\}:command$/);
        assert.equal(wire[4], wire[3].replace(/:command$/, ":work")); assert.deepEqual(wire.slice(5), ["60000", "100", "1300", "13"]);
        events.push("budget"); budgetCalls++; res.end(JSON.stringify({ result: budgetResult })); return;
      }
      assert.equal(req.headers.apikey, publicKey);
      const subject = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!subject) { res.writeHead(401); res.end('{"code":"bad_jwt","message":"Fixture credential denied"}'); return; }
      if (req.url.startsWith("/rest/v1/rpc/")) { events.push("rpc"); res.end(JSON.stringify(await rpc(req, subject))); return; }
      assert.equal(req.method, "GET"); assert.equal(req.url, "/auth/v1/user"); authCalls++; events.push("auth"); await delay(10);
      res.end(JSON.stringify({ id: subject, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" }));
    } catch { fixtureError = true; res.writeHead(500); res.end('{"status":"fixture_error"}'); }
  });
  providerOrigin = `http://127.0.0.1:${await listen(provider)}`;
  const reservation = createServer(), port = await listen(reservation); await new Promise(resolve => reservation.close(resolve)); nextOrigin = `https://localhost:${port}`;
  directory = await mkdtemp(join(tmpdir(), "spall-next-text-editor-")); const keyPath = join(directory, "fixture-key.pem"), certPath = join(directory, "fixture-cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", keyPath, "-out", certPath], { stdio: "ignore", timeout: 10000 });
  certificate = await readFile(certPath); await symlink(join(web, "node_modules"), join(directory, "node_modules"), "dir");
  await mkdir(join(directory, "app/api/editor"), { recursive: true }); await writeFile(join(directory, "package.json"), '{"name":"isolated-text-editor-fixture","private":true}');
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2017", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx",
    esModuleInterop: true, skipLibCheck: true, paths: { "@/*": [`${source}/*`] } } }));
  await writeFile(join(directory, "next.config.mjs"), `export default { devIndicators: false, webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(source)}; return config; } };`);
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
export async function POST(request: Request) { return handle(request); }
export async function GET() { return new Response("ready"); }
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
  assert.ok(ready, "isolated Text HTTPS runtime must become ready"); cookieA = await encodeSession(subjects[0]); cookieB = await encodeSession(subjects[1]);
}, { timeout: 60000 });
beforeEach(() => { models.clear(); calls = []; authCalls = 0; budgetCalls = 0; mutations = 0; events.length = 0;
  budgetResult = 1; restricted = false; malformedAck = false; fixtureError = undefined; });
after(async () => {
  if (child?.pid) { const exited = child.exitCode === null ? new Promise(resolve => child.once("exit", resolve)) : Promise.resolve();
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* already stopped */ }
    await Promise.race([exited, delay(2000)]); try { process.kill(-child.pid, "SIGKILL"); } catch { /* already stopped */ }
  }
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
  assert.equal(authCalls, 8); assert.equal(budgetCalls, 1); assert.equal(mutations, 1); assert.equal(events[0], "budget");
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
  assert.equal(authCalls, 0); assert.equal(calls.length, 0); assert.equal(budgetCalls, ["origin", "query"].includes(reason) ? 0 : 1);
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
