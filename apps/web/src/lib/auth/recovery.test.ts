import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { requestRecovery, restoreRecovery, recoveryEmailSchema } from "./recovery";
const id = "25600000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
const user = { id, aud: "authenticated", role: "authenticated", email: "owner@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function fixture() {
  const calls: { path: string; body: unknown; auth: string | null }[] = [];
  const state = { verify: true, update: true, mismatch: false, network: false, used: false };
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname; const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body, auth: new Headers(init?.headers).get("authorization") });
    if (state.network) throw new Error("private provider detail");
    if (path.endsWith("/recover")) return Response.json({});
    if (path.endsWith("/verify")) {
      if (!state.verify || state.used) return Response.json({ msg: "private invalid token" }, { status: 403 });
      state.used = true;
      return Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 3600, user });
    }
    if (path.endsWith("/user")) return state.update ? Response.json({ ...user, id: state.mismatch ? "foreign" : id })
      : Response.json({ msg: "private password policy" }, { status: 400 });
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    throw new Error("Unexpected recovery wire call");
  });
  const client = createClient("https://recovery.example.test", "publishable-fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  return { client, calls, state, fetcher };
}
it("requests provider recovery without account creation, redirect or private discovery", async () => {
  const f = fixture(); await requestRecovery(f.client, "owner@example.test");
  expect(f.calls).toHaveLength(1); expect(f.calls[0]?.path).toBe("/auth/v1/recover");
  expect(f.calls[0]?.body).toMatchObject({ email: "owner@example.test" });
  expect(JSON.stringify(f.calls)).not.toMatch(/redirect_to|signup|owner_id/);
});
it("verifies a fresh one-use recovery proof, updates only that session and clears ephemeral auth", async () => {
  const f = fixture(); expect(await restoreRecovery(f.client, token, "new-password")).toBe(true);
  expect(f.calls.map(x => x.path)).toEqual(["/auth/v1/verify", "/auth/v1/user", "/auth/v1/logout"]);
  expect(f.calls[0]?.body).toEqual({ type: "recovery", token_hash: token, gotrue_meta_security: {} });
  expect(f.calls[1]?.body).toEqual({ password: "new-password", code_challenge: null, code_challenge_method: null }); expect(f.calls[1]?.auth).toBe("Bearer fixture-access");
  expect((await f.client.auth.getSession()).data.session).toBeNull();
  expect(await restoreRecovery(f.client, token, "another-password")).toBe(false);
  expect(f.calls.filter(x => x.path.endsWith("/user"))).toHaveLength(1);
});
it.each(["expired", "update", "mismatch"])("fails closed for %s without claiming restored access", async mode => {
  const f = fixture(); if (mode === "expired") f.state.verify = false;
  if (mode === "update") f.state.update = false; if (mode === "mismatch") f.state.mismatch = true;
  expect(await restoreRecovery(f.client, token, "new-password")).toBe(false);
  expect((await f.client.auth.getSession()).data.session).toBeNull();
  if (mode === "expired") expect(f.calls.some(x => x.path.endsWith("/user"))).toBe(false);
});
it.each([["short", "new-password"], [token, "short"], [token, "x".repeat(1025)]])("denies invalid proof/password before provider calls %#", async ([proof, password]) => {
  const f = fixture(); expect(await restoreRecovery(f.client, proof!, password!)).toBe(false); expect(f.fetcher).not.toHaveBeenCalled();
});
it("validates bounded private email without treating public handles as identifiers", () => {
  expect(recoveryEmailSchema.parse(" owner@example.test ")).toBe("owner@example.test");
  for (const value of ["@handle", "owner", "x".repeat(255) + "@example.test", null]) expect(recoveryEmailSchema.safeParse(value).success).toBe(false);
});
