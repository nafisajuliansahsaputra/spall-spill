import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { handleIdentityLinkEditorCommandRequest as handle } from "./identity-link-editor-http";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const server = vi.mocked(createServerClient), origin = "https://editor.example.test";
const subject = "90000000-0000-4000-8000-000000000001", owner = "90000000-0000-4000-8000-000000000002", id = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", P = "resolve_current_owner_blocks_working_page";
function fixture(action = "add_link_block") {
  const init = action === "initialize_link_block", revision = init ? 1 : 4;
  const raw = { title: " <Raw> 😀 ", social_platform: null, destination_url: "javascript:private" };
  const command = { action, base_collection_revision: init ? null : 3, is_visible: false, link_working: { kind: "generic_link", ...raw } };
  const mutation = init ? "initialize_current_owner_blocks_from_link" : "add_current_owner_link_block_working";
  const context = { status: "success", current_handle: "http-owner", primary_use_case: "personal" };
  const row = { block_id: id, kind: "generic_link", position: 1, is_visible: false, payload_state: "present", link_working: raw };
  const page = { ...context, collection: { revision, blocks: [row], has_more: false, next_after_position: null } };
  const states: unknown[] = Array.from({ length: 8 }, () => active), pages: unknown[] = [page, page], calls: string[] = [];
  let reply: unknown = { status: "success", block_id: id, collection_revision: revision };
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://sdk.example.test"); expect(options!.method).toBe("POST");
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; expect([S, C, P, mutation]).toContain(rpc); calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === mutation) expect(body).toEqual({ input_intent: command });
    else if (rpc !== P) expect(body).toEqual({});
    const data = rpc === S ? states.shift() : rpc === C ? context : rpc === P ? pages.shift() : reply;
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://sdk.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject) => ({ data: { claims: { sub } }, error: null }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled SSR provider/claims; actual body reader, dispatcher, reviews and pinned SDK.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim()); server.mockResolvedValueOnce(client);
  const controller = new AbortController();
  const request = new Request(`${origin}/fixture`, { method: "POST", signal: controller.signal,
    headers: { origin, host: "editor.example.test", "content-type": "application/json" }, body: JSON.stringify(command) });
  const permit = vi.fn<(_: "identity_link_command", signal: AbortSignal) => Promise<unknown>>(async () => true);
  return { client, request, controller, permit, command, mutation, revision, context, row, page, states, pages, claims, claim, calls, fetcher,
    run: (r: Request = request) => handle(r, origin, permit), setReply: (value: unknown) => { reply = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); server.mockReset(); });
function headers(r: Response) {
  expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8"); expect(r.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(r.headers.get("pragma")).toBe("no-cache"); expect(r.headers.get("expires")).toBe("0"); expect(r.headers.get("referrer-policy")).toBe("no-referrer"); expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  for (const name of ["location", "set-cookie", "access-control-allow-origin", "authorization"]) expect(r.headers.has(name)).toBe(false);
}
for (const action of ["add_link_block", "initialize_link_block"]) {
  it(`${action} uses one request-local factory and actual guarded execution before private JSON`, async () => {
    const f = fixture(action), r = await f.run(); headers(r); expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: action === "add_link_block" ? "allocated" : "initialized", block_id: id, collection_revision: f.revision,
      readback: { status: "current", relation: "same_revision", snapshot: { ...f.context, collection: { revision: f.revision,
        blocks: [{ ...f.row, issues: [{ field: "destination_url", code: "destination_invalid" }] }] } } } });
    expect(server).toHaveBeenCalledTimes(1); expect(server).toHaveBeenCalledWith(); expect(f.permit).toHaveBeenCalledTimes(1); expect(f.claims).toHaveBeenCalledTimes(8);
    expect(f.calls).toEqual([S, S, f.mutation, S, S, S, C, P, S, C, P, S, S]);
  });
  it.each([null, {}, { status: "success", block_id: id, collection_revision: 99 }])(`${action} unknown acknowledgment %j is503 status-only, no readback`, async reply => {
    const f = fixture(action); f.setReply(reply); const r = await f.run(); headers(r); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toEqual([S, S, f.mutation]);
  });
  it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid"]) (`${action} maps known %s without fallback`, async status => {
    const f = fixture(action), actual = status === "invalid" ? action === "add_link_block" ? "invalid_add_intent" : "invalid_initialization_intent" : status;
    f.setReply({ status: actual }); const r = await f.run(); headers(r);
    expect(r.status).toBe(status === "unauthenticated" ? 401 : status === "unavailable" ? 503 : status === "invalid" ? 400 : 403);
    expect(await r.json()).toEqual({ status: actual }); expect(f.calls).toEqual([S, S, f.mutation]);
  });
  it(`${action} explicit conflict is409 and never tries another operation`, async () => {
    const f = fixture(action), status = action === "add_link_block" ? "stale_write" : "already_initialized"; f.setReply({ status });
    const r = await f.run(); headers(r); expect(r.status).toBe(409); expect(await r.json()).toEqual({ status }); expect(f.calls).toEqual([S, S, f.mutation]);
  });
  for (const phase of [0, 2, 7]) it(`${action} claim loss at phase${phase} strips all private data`, async () => {
    const f = fixture(action); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim()); f.claims.mockResolvedValueOnce(f.claim(null));
    const r = await f.run(); headers(r); expect(r.status).toBe(phase === 0 ? 401 : 503); expect(await r.json()).toEqual({ status: phase === 0 ? "unauthenticated" : "outcome_unknown" });
  });
  it(`${action} readback failure retains only known guarded acknowledgment`, async () => {
    const f = fixture(action); f.pages[0] = { status: "unavailable" }; const r = await f.run(); headers(r); expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: action === "add_link_block" ? "allocated" : "initialized", block_id: id, collection_revision: f.revision, readback: { status: "unavailable" } });
  });
}
it.each(["revision_exhausted", "position_exhausted"])("maps %s to409", async status => {
  const f = fixture(); f.setReply({ status }); const r = await f.run(); headers(r); expect(r.status).toBe(409); expect(await r.json()).toEqual({ status });
});
it.each(["owner_missing", "onboarding_incomplete", "restricted", "suspended"])("initial %s is403 without mutation", async status => {
  const f = fixture(); f.states[0] = status === "owner_missing" ? { status, owner_id: null, account_state: null, onboarding_completed: null }
    : { ...active, status, account_state: status === "onboarding_incomplete" ? "active" : status, onboarding_completed: status !== "onboarding_incomplete" };
  const r = await f.run(); headers(r); expect(r.status).toBe(403); expect(await r.json()).toEqual({ status }); expect(f.calls).toEqual([S]);
});
it.each(["metadata", "body", "selector", "permit"])("denies %s before SSR factory, claims or RPC", async reason => {
  const f = fixture(); let request = f.request;
  if (reason === "metadata") request.headers.set("origin", "https://evil.test");
  else if (reason === "permit") f.permit.mockResolvedValue(false);
  else request = new Request(request.url, { method: "POST", headers: request.headers, body: reason === "body" ? "bad JSON" : JSON.stringify({ ...f.command, owner_id: owner }) });
  const r = await f.run(request); headers(r); expect(r.status).toBe(403); expect(await r.json()).toEqual({ status: "unavailable" });
  expect(server).not.toHaveBeenCalled(); expect(f.claims).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
});
it("SSR factory failure is503 without exposing diagnostic or dispatching", async () => {
  const f = fixture(); server.mockReset().mockRejectedValueOnce(new Error("private credential detail")); const r = await f.run(); headers(r);
  expect(r.status).toBe(503); expect(await r.text()).toBe('{"status":"unavailable"}'); expect(f.calls).toEqual([]);
});
it.each(["abort", "headers", "elapsed"])("factory %s interruption cannot dispatch", async reason => {
  const f = fixture(); let now = 0; if (reason === "elapsed") vi.spyOn(performance, "now").mockImplementation(() => now);
  server.mockReset().mockImplementationOnce(async () => {
    if (reason === "abort") f.controller.abort(); else if (reason === "headers") f.request.headers.set("host", "evil.test"); else now = 20001;
    return f.client;
  });
  const r = await f.run(); headers(r); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "unavailable" }); expect(f.calls).toEqual([]);
});
it("hung factory times out; late resolution never invokes command", async () => {
  vi.useFakeTimers(); const f = fixture(); let release!: (value: typeof f.client) => void;
  server.mockReset().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.run(); await vi.advanceTimersByTimeAsync(20001); const r = await pending; headers(r); expect(await r.json()).toEqual({ status: "unavailable" });
  release(f.client); await vi.advanceTimersByTimeAsync(10000); expect(f.calls).toEqual([]); expect(f.claims).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it.each(["abort", "headers"])("%s after dispatched mutation returns only unknown", async reason => {
  const f = fixture(), original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (input, options) => { const reply = await original(input, options);
    if (String(input).endsWith(f.mutation)) { if (reason === "abort") f.controller.abort(); else f.request.headers.set("host", "evil.test"); } return reply;
  });
  const r = await f.run(); headers(r); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "outcome_unknown" });
  expect(f.calls.filter(x => x === f.mutation)).toHaveLength(1);
});
it("outer deadline after late factory and already-dispatched SDK never revives output or claims rollback", async () => {
  vi.useFakeTimers(); const f = fixture(); server.mockReset().mockImplementationOnce(async () => { await new Promise(resolve => setTimeout(resolve, 19000)); return f.client; });
  let release!: () => void; const original = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation(async (input, options) => { if (String(input).endsWith(f.mutation)) await new Promise<void>(r => { release = r; }); return original(input, options); });
  const pending = f.run(); await vi.advanceTimersByTimeAsync(20001); const r = await pending; headers(r); expect(await r.json()).toEqual({ status: "outcome_unknown" });
  release(); await vi.advanceTimersByTimeAsync(10000); expect(f.calls.filter(x => x === f.mutation)).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
});
it("concurrent requests use distinct SSR clients with no cross-request private snapshot", async () => {
  const f = fixture(), g = fixture("initialize_link_block"); const other = "90000000-0000-4000-8000-000000000004";
  g.claims.mockResolvedValue(g.claim(other)); g.states.fill({ ...active, owner_id: other });
  g.pages.fill({ ...g.page, current_handle: "second-owner" });
  // Context must agree in both independently complete observations.
  const original = g.fetcher.getMockImplementation()!;
  g.fetcher.mockImplementation(async (input, options) => String(input).endsWith(C)
    ? new Response(JSON.stringify({ ...g.context, current_handle: "second-owner" }), { headers: { "content-type": "application/json" } }) : original(input, options));
  const [a, b] = await Promise.all([f.run(), g.run()]); headers(a); headers(b); expect(server).toHaveBeenCalledTimes(2);
  const first = await a.json(), second = await b.json(); expect(first.status).toBe("allocated"); expect(second.status).toBe("initialized");
  expect(first.readback.snapshot.current_handle).toBe("http-owner"); expect(second.readback.snapshot.current_handle).toBe("second-owner");
  expect(f.calls.filter(x => x === f.mutation)).toHaveLength(1); expect(g.calls.filter(x => x === g.mutation)).toHaveLength(1);
});
it("oversized complete private readback retains only the guarded acknowledgment", async () => {
  const f = fixture(), blocks = Array.from({ length: 1000 }, (_, i) => ({ ...f.row,
    block_id: `90000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, position: i + 1,
    link_working: { title: "😀".repeat(512), social_platform: null, destination_url: "😀".repeat(2048) } }));
  const pages = Array.from({ length: 10 }, (_, i) => ({ ...f.context, collection: { revision: 5, blocks: blocks.slice(i * 100, (i + 1) * 100), has_more: i !== 9, next_after_position: i === 9 ? null : (i + 1) * 100 } }));
  f.pages.splice(0, f.pages.length, ...pages, ...pages); const r = await f.run(); headers(r); expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ status: "allocated", block_id: id, collection_revision: 4, readback: { status: "unavailable" } });
  expect(f.calls.filter(x => x === P)).toHaveLength(20); expect(f.calls).toHaveLength(31); expect(f.claims).toHaveBeenCalledTimes(8);
});
