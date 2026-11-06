import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ service: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }));
import { readPublicIdentity, openPublicIdentityConnection } from "./identity-server";
import { publicIdentityPayloadSchema } from "./identity-contract";
const binding = "a".repeat(64);
const published = { status: "success", current_handle: "public-one", display_name: "Published Identity",
  bio: "Published bio", starter_key: "clean", has_spill: false,
  connection: { connection_kind: "generic_link", social_platform: null, available: true, binding } };
let calls: { url: string; body: Record<string, unknown> }[]; let payload: unknown; let denied = false;
beforeEach(() => {
  calls = []; payload = published; denied = false;
  vi.stubEnv("SPALL_PUBLIC_IDENTITY_ENABLED", "true"); vi.stubEnv("SPALL_PUBLIC_ORIGIN", "https://spall.example.test"); vi.stubEnv("SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE", "unit");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fixture.upstash.io"); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fixture-budget-token");
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
    const target = String(url); calls.push({ url: target, body: JSON.parse(String(init?.body)) });
    return Response.json(target === "https://fixture.upstash.io/" ? { result: denied ? 0 : 1 } : payload);
  }));
  mocks.service.mockImplementation((fetcher: typeof fetch) => createClient("https://fixture.supabase.co", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher },
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("normalizes only the handle and uses real abortable service SDK after aggregate quota", async () => {
  expect(await readPublicIdentity("PUBLIC-ONE")).toEqual(published);
  expect(calls).toHaveLength(2); expect(calls[1]!.url).toContain("/rpc/execute_public_identity_server");
  expect(calls[1]!.body).toEqual({ input_operation: "read", input_handle: "public-one", input_binding: null });
  expect(JSON.stringify(calls[0]!.body)).not.toContain("public-one");
  expect(calls[0]!.body).toEqual(expect.arrayContaining(["600", "7800"]));
});
it("uses exactly the same aggregate bucket across handles", async () => {
  await readPublicIdentity("public-one"); await readPublicIdentity("other-owner"); expect(calls[0]!.body).toEqual(calls[2]!.body);
});
it("denies Redis rejection before service creation", async () => {
  denied = true; expect(await readPublicIdentity("public-one")).toBeNull(); expect(calls).toHaveLength(1); expect(mocks.service).not.toHaveBeenCalled();
});
it.each(["false", "", "TRUE"])("default-off flag %j never invokes providers", async flag => {
  vi.stubEnv("SPALL_PUBLIC_IDENTITY_ENABLED", flag); expect(await readPublicIdentity("public-one")).toBeNull(); expect(calls).toEqual([]);
});
it.each(["", "UPPER", "../../other"])("invalid namespace %j denies before providers", async namespace => {
  vi.stubEnv("SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE", namespace); expect(await readPublicIdentity("public-one")).toBeNull(); expect(calls).toEqual([]);
});
it.each(["../private", " public-one", "ab", "x".repeat(31)])("rejects locator %j before providers", async handle => {
  expect(await readPublicIdentity(handle)).toEqual({ status: "unavailable" }); expect(calls).toEqual([]);
});
it.each(["owner_id", "receipt_id", "profile_asset_key", "working"])("rejects extra %s in response", async key => {
  payload = { ...published, [key]: "private" }; expect(await readPublicIdentity("public-one")).toBeNull();
});
it("rejects URL-bearing read response and retains unavailable Connection context", async () => {
  payload = { ...published, connection: { ...published.connection, destination_url: "https://example.test/" } };
  expect(await readPublicIdentity("public-one")).toBeNull();
  payload = { ...published, connection: { ...published.connection, available: false } };
  expect(await readPublicIdentity("public-one")).toEqual(payload);
});
it("accepts minimal valid snapshot and full Unicode profile bounds", () => {
  expect(publicIdentityPayloadSchema.safeParse({ ...published, display_name: "😀".repeat(80), bio: "😀".repeat(300), connection: null }).success).toBe(true);
  expect(publicIdentityPayloadSchema.safeParse({ ...published, bio: "x".repeat(301) }).success).toBe(false);
});
it("opens only canonical safe destination after fixed open quota", async () => {
  payload = { status: "success", destination_url: "https://example.test/link" };
  expect(await openPublicIdentityConnection("public-one", binding)).toBe("https://example.test/link");
  expect(calls[0]!.body).toEqual(expect.arrayContaining(["60", "780"]));
  expect(calls[1]!.body).toEqual({ input_operation: "open", input_handle: "public-one", input_binding: binding });
});
it.each(["javascript:alert(1)", "https://user:secret@example.test", "http://127.0.0.1/private", "https://example.test/../change"])("rejects malformed/unsafe opened %s", async url => {
  payload = { status: "success", destination_url: url }; expect(await openPublicIdentityConnection("public-one", binding)).toBeNull();
});
it("rejects forged binding before providers", async () => { expect(await openPublicIdentityConnection("public-one", "fake")).toBeNull(); expect(calls).toEqual([]); });
it("missing origin denies the entire surface before provider work", async () => {
 vi.stubEnv("SPALL_PUBLIC_ORIGIN", "");expect(await readPublicIdentity("public-one")).toBeNull();expect(calls).toEqual([]);
});
it("holds the RPC deadline even if the transport ignores cancellation", async () => {
 vi.useFakeTimers();let signal:AbortSignal|undefined;
 try {
  vi.stubGlobal("fetch",vi.fn(async(url:unknown,init?:RequestInit)=>{
   if(String(url)==="https://fixture.upstash.io/")return Response.json({result:1});
   signal=init?.signal??undefined;return await new Promise<Response>(()=>{});
  }));
  const read=readPublicIdentity("public-one");await vi.advanceTimersByTimeAsync(5001);
  expect(await read).toBeNull();expect(signal?.aborted).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);
 }finally{vi.useRealTimers();}
});
