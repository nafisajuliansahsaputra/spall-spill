import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
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
const signingKey = randomBytes(32); let verificationKey = signingKey;
const subjects = ["91000000-0000-4000-8000-000000000001", "91000000-0000-4000-8000-000000000002"];
let provider, child, directory, providerOrigin, nextOrigin, cookieA, cookieB;
let userCalls = 0, refreshCalls = 0, inFlight = 0, maximumInFlight = 0;
const deniedSubjects = new Set();
const refreshSubjects = new Map(); let rejectRefresh = false;
const user = subject => ({ id: subject, aud: "authenticated", role: "authenticated", email: "fixture@example.test",
  app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" });
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
    const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", verificationKey).update(`${header}.${payload}`).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    return subjects.includes(claims.sub) && claims.iss === `${providerOrigin}/auth/v1` && claims.aud === "authenticated"
      && claims.exp > Math.floor(Date.now() / 1000) && !deniedSubjects.has(claims.sub) ? claims.sub : null;
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
async function request(cookie, path = "/api/session", extraHeaders = {}) {
  return fetch(`${nextOrigin}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...extraHeaders },
    redirect: "manual", signal: AbortSignal.timeout(15000) });
}
async function expectSubject(cookie, subject, path = "/api/session") {
  const response = await request(cookie, path);
  assert.equal(response.status, subject ? 200 : 401);
  assert.equal(response.headers.has("location"), false);
  assert.deepEqual(await response.json(), subject ? { status: "authenticated", subject } : { status: "unauthenticated" });
  return response;
}
function refreshHeaders(response, redirect = false) {
  assert.equal(response.headers.get("cache-control"), redirect ? "private, no-store" : "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(response.headers.get("expires"), "0"); assert.equal(response.headers.get("pragma"), "no-cache");
  assert.ok(response.headers.get("content-security-policy"));
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith("sb-") && value.includes("auth-token")));
}
function responseCookie(response) {
  return response.headers.getSetCookie().filter(value => value.startsWith("sb-")).map(value => value.split(";")[0]).join("; ");
}
function redirected(response) {
  assert.equal(response.status, 307);
  const location = new URL(response.headers.get("location"), response.url);
  assert.equal(location.pathname, "/login"); assert.equal(location.search, ""); assert.equal(location.hash, "");
  assert.equal(location.origin, new URL(response.url).origin);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const intended = response.headers.getSetCookie().find(value => value.startsWith("spall_intended_destination="));
  assert.ok(intended); assert.equal(decodeURIComponent(intended.split(";")[0].split("=")[1]), "/dashboard/identity");
  assert.ok(/httponly/i.test(intended)); assert.ok(/samesite=lax/i.test(intended));
}
before(async () => {
  provider = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/auth/v1/token?grant_type=refresh_token") {
      refreshCalls++;
      let raw = ""; for await (const part of req) { raw += part; if (raw.length > 4096) { res.writeHead(400); res.end('{}'); return; } }
      let subject; try { subject = refreshSubjects.get(JSON.parse(raw).refresh_token); } catch { /* malformed fixture request denied */ }
      if (rejectRefresh || !subject || req.headers.apikey !== publicKey) {
        res.writeHead(400); res.end(JSON.stringify({ code: "refresh_token_not_found", message: "Fixture refresh denied" })); return;
      }
      const rotated = `isolated-rotated-${randomBytes(16).toString("hex")}`; refreshSubjects.set(rotated, subject);
      res.end(JSON.stringify({ access_token: token(subject), refresh_token: rotated, token_type: "bearer", expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(subject) })); return;
    }
    if (req.method !== "GET" || req.url !== "/auth/v1/user" || req.headers.apikey !== publicKey) {
      res.writeHead(404); res.end('{}'); return;
    }
    userCalls++; inFlight++; maximumInFlight = Math.max(maximumInFlight, inFlight);
    const subject = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    await delay(30); inFlight--;
    if (!subject) { res.writeHead(401); res.end(JSON.stringify({ code: "bad_jwt", message: "Fixture credential denied" })); return; }
    res.end(JSON.stringify({ id: subject, aud: "authenticated", role: "authenticated", email: "fixture@example.test",
      app_metadata: {}, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" }));
  });
  providerOrigin = `http://127.0.0.1:${await listen(provider)}`;
  const reservation = createServer(); const port = await listen(reservation); await new Promise(resolve => reservation.close(resolve));
  nextOrigin = `http://127.0.0.1:${port}`;
  directory = await mkdtemp(join(tmpdir(), "spall-next-proxy-"));
  await symlink(join(web, "node_modules"), join(directory, "node_modules"), "dir");
  await mkdir(join(directory, "app/api/session"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "isolated-spall-session-fixture", private: true }));
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2017", module: "esnext", moduleResolution: "bundler",
    jsx: "react-jsx", esModuleInterop: true, skipLibCheck: true, paths: { "@/*": [`${source}/*`] } } }));
  await writeFile(join(directory, "next.config.mjs"), `export default { devIndicators: false, webpack(config) { config.resolve.alias["@"] = ${JSON.stringify(source)}; return config; } };`);
  await writeFile(join(directory, "app/api/session/route.ts"), `
import { createClient } from ${JSON.stringify(join(source, "lib/supabase/server"))};
export const dynamic = "force-dynamic";
export async function GET() {
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const subject = !error && data?.claims?.sub;
  return Response.json(subject ? { status: "authenticated", subject } : { status: "unauthenticated" },
    { status: subject ? 200 : 401, headers: {} });
}
`);
  await mkdir(join(directory, "app/dashboard/identity"), { recursive: true });
  const diagnostic = await import("node:fs/promises").then(fs => fs.readFile(join(directory, "app/api/session/route.ts"), "utf8"));
  await writeFile(join(directory, "app/dashboard/identity/route.ts"), diagnostic);
  await writeFile(join(directory, "proxy.ts"), `
import type { NextRequest } from "next/server";
import { proxy as actualProxy } from ${JSON.stringify(join(source, "proxy"))};
export function proxy(request: NextRequest) { return actualProxy(request); }
export const config = { matcher: ["/api/session", "/dashboard/identity"] };
`);
  child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: directory, detached: true, stdio: ["ignore", "ignore", "ignore"],
    env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: providerOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey },
  });
  let spawnError; child.once("error", error => { spawnError = error; });
  const startupDeadline = performance.now() + 45000;
  let ready = false;
  while (performance.now() < startupDeadline) {
    if (spawnError || child.exitCode !== null) throw new Error("isolated Next runtime failed to start");
    try {
      const response = await fetch(`${nextOrigin}/api/session`, { signal: AbortSignal.timeout(3000) });
      if (response.status === 401) { ready = true; break; }
      if (response.status === 500) throw new Error("isolated Next fixture compilation failed");
    } catch (error) {
      if (error.message === "isolated Next fixture compilation failed") throw error;
    }
    await delay(250);
  }
  assert.ok(ready, "isolated Next runtime must become ready before its startup deadline");
  await expectSubject(undefined, null);
  cookieA = await encodeSession(subjects[0]); cookieB = await encodeSession(subjects[1]);
}, { timeout: 60000 });
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
beforeEach(() => { userCalls = 0; refreshCalls = 0; maximumInFlight = 0; rejectRefresh = false; });
test("actual Proxy redirects anonymous protected navigation and retains safe intended destination", { timeout: 60000 }, async () => {
  redirected(await request(undefined, "/dashboard/identity")); assert.equal(userCalls, 0); assert.equal(refreshCalls, 0);
});
test("bearer and Owner hints never substitute for Proxy request cookie", { timeout: 60000 }, async () => {
  redirected(await request(undefined, "/dashboard/identity", { authorization: `Bearer ${token(subjects[0])}`, "x-owner-id": subjects[0] }));
  assert.equal(userCalls, 0); assert.equal(refreshCalls, 0);
});
test("actual Proxy and downstream SSR keep sequential cookie subjects isolated", { timeout: 60000 }, async () => {
  await expectSubject(cookieA, subjects[0], "/dashboard/identity"); await expectSubject(cookieB, subjects[1], "/dashboard/identity");
  redirected(await request(undefined, "/dashboard/identity")); assert.equal(refreshCalls, 0);
});
test("actual Proxy and downstream SSR isolate concurrent cookie subjects", { timeout: 60000 }, async () => {
  await Promise.all(Array.from({ length: 6 }, (_, i) => expectSubject(i % 2 ? cookieB : cookieA, subjects[i % 2], "/dashboard/identity")));
  assert.ok(maximumInFlight >= 2); assert.equal(refreshCalls, 0);
});
for (const path of ["/api/session", "/dashboard/identity"]) {
  test(`actual Proxy refresh at ${path} forwards new cookie within same request and preserves cache headers`, { timeout: 60000 }, async () => {
    const cookie = await encodeSession(subjects[0], 2); await delay(2100);
    const response = await expectSubject(cookie, subjects[0], path); refreshHeaders(response); assert.equal(refreshCalls, 1);
    const updated = responseCookie(response); assert.ok(updated.length > 0);
    await expectSubject(updated, subjects[0], path); assert.equal(refreshCalls, 1);
    redirected(await request(undefined, "/dashboard/identity"));
  });
  test(`actual Proxy refresh denial at ${path} retains clearing cookies and safe cache/redirect truth`, { timeout: 60000 }, async () => {
    const cookie = await encodeSession(subjects[0], 2); await delay(2100); rejectRefresh = true;
    const response = await request(cookie, path); assert.equal(refreshCalls, 1);
    if (path.startsWith("/dashboard")) redirected(response);
    else { assert.equal(response.status, 401); assert.deepEqual(await response.json(), { status: "unauthenticated" }); }
    refreshHeaders(response, path.startsWith("/dashboard"));
    assert.ok(response.headers.getSetCookie().some(value => value.startsWith("sb-") && /max-age=0/i.test(value)));
  });
}
test("concurrent actual Proxy refreshes retain separate rotated cookie subjects", { timeout: 60000 }, async () => {
  const cookies = await Promise.all(subjects.map(subject => encodeSession(subject, 2))); await delay(2100);
  const responses = await Promise.all(cookies.map((cookie, i) => expectSubject(cookie, subjects[i], "/dashboard/identity")));
  assert.equal(refreshCalls, 2);
  for (let i = 0; i < 2; i++) { refreshHeaders(responses[i]); await expectSubject(responseCookie(responses[i]), subjects[i], "/dashboard/identity"); }
  assert.equal(refreshCalls, 2);
});
