import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerProfileTextWorkingSave } from "./owner-profile-text-working-save";
const subject = "24800000-0000-4000-8000-000000000001";
const owner = "24800000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const text = { display_name: " <Private> ", bio: " Raw\r\nBio " };
const intent = { action: "save_profile_text_working", base_profile_revision: 2, base_text_revision: null, profile_text_working: text };
const success = { status: "success", source_profile_revision: 2, text_revision: 1 };
function fixture(...values: unknown[]) {
  const value = values.length ? values[0] : intent;
  const states: unknown[] = [active, active]; const calls: string[] = []; let reply: unknown = success;
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const rpc = String(url).split("/").at(-1)!; calls.push(rpc);
    expect(new URL(String(url)).origin).toBe("https://layout.example.test");
    expect(options!.method).toBe("POST"); expect(options!.signal).toBeDefined();
    expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(JSON.parse(String(options!.body))).toEqual(rpc === "resolve_current_owner_state" ? {} : { input_working: value });
    return Response.json(rpc === "resolve_current_owner_state" ? states.shift() : reply);
  });
  const client = createClient("https://layout.example.test", "test-placeholder", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub = subject) => ({ data: { claims: { sub } }, error: null }) as never;
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim());
  return { save: () => createOwnerProfileTextWorkingSave(client).save(value), states, calls, fetcher, claims, claim, setReply: (v: unknown) => { reply = v; } };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it.each([null, 1, 76])("explicit source/text CAS %j uses exact raw payload and ack", async base_text_revision => {
  const f = fixture({ ...intent, base_text_revision });
  const ack = { ...success, text_revision: (base_text_revision ?? 0) + 1 }; f.setReply(ack);
  expect(await f.save()).toEqual(ack); expect(f.claims).toHaveBeenCalledTimes(2);
  expect(f.calls).toEqual(["resolve_current_owner_state", "save_current_owner_profile_text_working", "resolve_current_owner_state"]);
});
it.each([null, undefined, {}, [], "save", { ...intent, action: "publish" },
  ...[0, -1, 1.5, "2", null, true, Number.MAX_SAFE_INTEGER + 1].map(base_profile_revision => ({ ...intent, base_profile_revision })),
  ...[0, -1, 1.5, "1", true, Number.MAX_SAFE_INTEGER + 1, undefined].map(base_text_revision => ({ ...intent, base_text_revision })),
  ...[null, {}, { ...text, display_name: "\u0000" }, { ...text, bio: "x".repeat(16385) }, { ...text, profile_asset_key: "foreign" }].map(profile_text_working => ({ ...intent, profile_text_working })),
  ...["owner_id", "handle", "profile_asset_key", "block_ids", "base_progress_revision", "published"].map(key => ({ ...intent, [key]: "forged" })),
])("denies malformed or caller authority intent %# before I/O", async value => {
  const f = fixture(value); expect(await f.save()).toEqual({ status: "invalid_profile_text_working" }); expect(f.calls).toEqual([]); expect(f.claims).not.toHaveBeenCalled();
});
it.each(["restricted", "suspended", "onboarding_incomplete", "owner_missing"])("initial %s never dispatches", async status => {
  const f = fixture(); f.states[0] = status === "owner_missing" ? { status, owner_id: null, account_state: null, onboarding_completed: null }
    : { ...active, status, account_state: status === "onboarding_incomplete" ? "active" : status, onboarding_completed: status !== "onboarding_incomplete" };
  expect(await f.save()).toEqual({ status }); expect(f.calls).toEqual(["resolve_current_owner_state"]);
});
it.each(["stale_write", "stale_source", "revision_exhausted", "unavailable", "owner_not_eligible", "invalid_profile_text_working"])("retains status-only %s without retry", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.save()).toEqual({ status }); expect(f.calls).toHaveLength(2);
});
it.each([null, {}, { ...success, owner_id: owner }, { ...success, text_revision: 0 },
  { ...success, source_profile_revision: 3 }, { ...success, text_revision: 2 },
])("malformed or wrong acknowledgment %# is outcome_unknown", async reply => {
  const f = fixture(); f.setReply(reply); expect(await f.save()).toEqual({ status: "outcome_unknown" }); expect(f.calls).toHaveLength(2);
});
it.each(["subject", "owner", "restriction"])("post-save %s change cannot claim saved", async field => {
  const f = fixture();
  if (field === "subject") f.claims.mockResolvedValueOnce(f.claim()).mockResolvedValueOnce(f.claim(owner));
  else f.states[1] = field === "owner" ? { ...active, owner_id: subject } : { ...active, status: "restricted", account_state: "restricted" };
  expect(await f.save()).toEqual({ status: "outcome_unknown" });
});
it("claims failure is unauthenticated without RPC", async () => {
  const f = fixture(); f.claims.mockResolvedValue({ data: null, error: new Error("private") } as never);
  expect(await f.save()).toEqual({ status: "unauthenticated" }); expect(f.calls).toEqual([]);
});
it("maximum safe text base accepts only exhaustion, not unsafe ack", async () => {
  const f = fixture({ ...intent, base_text_revision: Number.MAX_SAFE_INTEGER }); f.setReply({ status: "revision_exhausted" });
  expect(await f.save()).toEqual({ status: "revision_exhausted" });
});
it.each([false, true])("transport error after dispatch=%s never retries", async dispatched => {
  const f = fixture(); const base = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => String(url).endsWith(dispatched ? "save_current_owner_profile_text_working" : "resolve_current_owner_state")
    ? Promise.reject(new Error("private transport marker")) : base(url, options));
  expect(await f.save()).toEqual({ status: dispatched ? "outcome_unknown" : "unavailable" });
});
it.each([false, true])("deadline after dispatch=%s aborts without leaking/retrying", async dispatched => {
  vi.useFakeTimers(); const f = fixture(); let signal: AbortSignal | null | undefined;
  const base = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => String(url).endsWith(dispatched ? "save_current_owner_profile_text_working" : "resolve_current_owner_state")
    ? new Promise(() => { signal = options?.signal; }) : base(url, options));
  const pending = f.save(); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: dispatched ? "outcome_unknown" : "unavailable" }); expect(signal?.aborted).toBe(true);
});
