import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createOwnerLayoutWorkingSave } from "./owner-layout-working-save";
const subject = "24700000-0000-4000-8000-000000000001";
const owner = "24700000-0000-4000-8000-000000000002";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const intent = { action: "save_layout_working", base_layout_revision: 7, starter_key: "featured" };
const success = { status: "success", changed: true, layout_working: { starter_key: "featured", revision: 8 } };
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
  return { save: () => createOwnerLayoutWorkingSave(client).save(value), states, calls, fetcher, claims, claim, setReply: (v: unknown) => { reply = v; } };
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it.each(["clean", "social_focus", "featured", "business"])("acknowledges exact %s layout, content stays outside intent", async starter_key => {
  const changed = starter_key !== "clean"; const f = fixture({ ...intent, starter_key });
  const ack = { status: "success", changed, layout_working: { starter_key, revision: changed ? 8 : 7 } }; f.setReply(ack);
  expect(await f.save()).toEqual(ack); expect(f.claims).toHaveBeenCalledTimes(2);
  expect(f.calls).toEqual(["resolve_current_owner_state", "save_current_owner_layout_working", "resolve_current_owner_state"]);
});
it.each([null, undefined, {}, [], "save", { ...intent, action: "publish" },
  ...[0, -1, 1.5, "7", null, true, Number.MAX_SAFE_INTEGER + 1].map(base_layout_revision => ({ ...intent, base_layout_revision })),
  ...[null, "", "Clean", "clean ", "custom_css", "clean');drop table core.owners;--"].map(starter_key => ({ ...intent, starter_key })),
  ...["owner_id", "handle", "profile_working", "block_ids", "base_progress_revision", "published", "css"].map(key => ({ ...intent, [key]: "forged" })),
])("denies malformed or caller authority intent %# before I/O", async value => {
  const f = fixture(value); expect(await f.save()).toEqual({ status: "invalid_layout_working" }); expect(f.calls).toEqual([]); expect(f.claims).not.toHaveBeenCalled();
});
it.each(["restricted", "suspended", "onboarding_incomplete", "owner_missing"])("initial %s never dispatches", async status => {
  const f = fixture(); f.states[0] = status === "owner_missing" ? { status, owner_id: null, account_state: null, onboarding_completed: null }
    : { ...active, status, account_state: status === "onboarding_incomplete" ? "active" : status, onboarding_completed: status !== "onboarding_incomplete" };
  expect(await f.save()).toEqual({ status }); expect(f.calls).toEqual(["resolve_current_owner_state"]);
});
it.each(["stale_write", "revision_exhausted", "unavailable", "owner_not_eligible", "invalid_layout_working"])("retains status-only %s without retry", async status => {
  const f = fixture(); f.setReply({ status }); expect(await f.save()).toEqual({ status }); expect(f.calls).toHaveLength(2);
});
it.each([null, {}, { ...success, owner_id: owner }, { ...success, changed: false },
  { ...success, layout_working: { starter_key: "business", revision: 8 } },
  { ...success, layout_working: { starter_key: "featured", revision: 9 } },
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
it("maximum safe no-op is acknowledged without unsafe increment", async () => {
  const f = fixture({ ...intent, base_layout_revision: Number.MAX_SAFE_INTEGER });
  const ack = { status: "success", changed: false, layout_working: { starter_key: "featured", revision: Number.MAX_SAFE_INTEGER } }; f.setReply(ack);
  expect(await f.save()).toEqual(ack);
});
it.each([false, true])("deadline after dispatch=%s aborts without leaking/retrying", async dispatched => {
  vi.useFakeTimers(); const f = fixture(); let signal: AbortSignal | null | undefined;
  const base = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((url, options) => String(url).endsWith(dispatched ? "save_current_owner_layout_working" : "resolve_current_owner_state")
    ? new Promise(() => { signal = options?.signal; }) : base(url, options));
  const pending = f.save(); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ status: dispatched ? "outcome_unknown" : "unavailable" }); expect(signal?.aborted).toBe(true);
});
