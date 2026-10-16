import { before, after, test } from "node:test";
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
  const { error } = await client.auth.setSession({ access_token: token(subject, lifetime), refresh_token: "isolated-refresh-placeholder" });
  assert.equal(error, null, "fixture session issuance must succeed through actual SSR SDK");
  assert.ok(jar.size > 0, "actual SSR SDK must encode cookies");
  return [...jar].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
}
async function request(cookie, extraHeaders = {}, suffix = "") {
  return fetch(`${nextOrigin}/api/session${suffix}`, { headers: { ...(cookie ? { cookie } : {}), ...extraHeaders },
    redirect: "error", signal: AbortSignal.timeout(15000) });
}
async function expectSubject(cookie, subject, extraHeaders, suffix) {
  const response = await request(cookie, extraHeaders, suffix);
  assert.equal(response.status, subject ? 200 : 401);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.has("location"), false);
  assert.deepEqual(await response.json(), subject ? { status: "authenticated", subject } : { status: "unauthenticated" });
}
before(async () => {
  provider = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/auth/v1/token?grant_type=refresh_token") {
      refreshCalls++; res.writeHead(400); res.end(JSON.stringify({ code: "refresh_token_not_found", message: "Fixture refresh denied" })); return;
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
  directory = await mkdtemp(join(tmpdir(), "spall-next-cookie-"));
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
    { status: subject ? 200 : 401, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
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
test("anonymous request has no subject and never calls Auth provider", { timeout: 60000 }, async () => {
  const before = userCalls; await expectSubject(undefined, null); assert.equal(userCalls, before);
});
test("Authorization/header/URL hints cannot replace the request session cookie", { timeout: 60000 }, async () => {
  await expectSubject(undefined, null, { authorization: `Bearer ${token(subjects[0])}`, "x-owner-id": subjects[0], "x-forwarded-for": "192.0.2.1" }, `?owner_id=${subjects[0]}`);
});
test("malformed/unrelated cookie fails closed without session fallback", { timeout: 60000 }, async () => {
  await expectSubject("unrelated=forged; sb-forged-auth-token=invalid", null);
  const actualCookieName = cookieA.split("=")[0];
  await expectSubject(`${actualCookieName}=invalid`, null);
});
test("actual SSR cookies select the correct subject sequentially, then clear request context", { timeout: 60000 }, async () => {
  await expectSubject(cookieA, subjects[0]); await expectSubject(cookieB, subjects[1]); await expectSubject(undefined, null);
});
test("concurrent actual HTTP requests keep different cookie subjects isolated", { timeout: 60000 }, async () => {
  maximumInFlight = 0;
  await Promise.all(Array.from({ length: 8 }, (_, i) => expectSubject(i % 2 ? cookieB : cookieA, subjects[i % 2])));
  assert.ok(maximumInFlight >= 2, "provider must observe overlapping authenticated requests");
  await expectSubject(undefined, null);
});
test("signature-key mismatch denies previously encoded session through actual getClaims fallback", { timeout: 60000 }, async () => {
  verificationKey = randomBytes(32);
  try { await expectSubject(cookieA, null); } finally { verificationKey = signingKey; }
  await expectSubject(cookieA, subjects[0]);
});
test("controlled provider rejection denies cookie session and leaves other subject usable", { timeout: 60000 }, async () => {
  deniedSubjects.add(subjects[0]);
  try { await expectSubject(cookieA, null); await expectSubject(cookieB, subjects[1]); } finally { deniedSubjects.clear(); }
});
test("expired cookie cannot authenticate when controlled refresh is rejected", { timeout: 60000 }, async () => {
  const cookie = await encodeSession(subjects[0], 2); await delay(2100);
  const before = refreshCalls; await expectSubject(cookie, null); assert.ok(refreshCalls > before);
});
