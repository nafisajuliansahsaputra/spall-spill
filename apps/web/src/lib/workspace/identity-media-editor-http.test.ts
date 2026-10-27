import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { handleIdentityMediaEditorCommandRequest as handle } from "./identity-media-editor-http";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const server = vi.mocked(createServerClient), origin = "https://editor.example.test";
const subject = "90000000-0000-4000-8000-000000000001", owner = "90000000-0000-4000-8000-000000000002", id = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", T = "resolve_current_owner_media_block_working";
const actions = ["add_media_block", "initialize_media_block", "save_media_block"] as const;
type Action = typeof actions[number];
function fixture(action: Action = "add_media_block") {
  const init = action === "initialize_media_block", save = action === "save_media_block", revision = init ? 1 : 4;
  const raw = { asset_key: "abcdef00-0000-4000-8000-000000000003", alt_text: " <Raw> 😀 " };
  const command = { action, base_collection_revision: init ? null : 3,
    ...(save ? { block_id: id } : { is_visible: false }), media_working: { kind: "media", ...raw } };
  const mutation = init ? "initialize_current_owner_blocks_from_media" : save ? "save_current_owner_block_media_working" : "add_current_owner_media_block_working";
  const status = init ? "initialized" : save ? "saved" : "allocated";
  const context = { status: "success", current_handle: "http-owner", primary_use_case: "personal" };
  const row = { block_id: id, kind: "media", position: init ? 1 : 7, is_visible: save, payload_state: "present", asset_state: "registered", media_working: raw };
  const snapshot = { ...context, collection_revision: revision, block: row };
  const states: unknown[] = Array.from({ length: 8 }, () => active), medias: unknown[] = [snapshot, snapshot], calls: string[] = [];
  let reply: unknown = { status: "success", block_id: id, collection_revision: revision };
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://sdk.example.test"); expect(options!.method).toBe("POST");
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.signal).toBeDefined();
    const rpc = url.pathname.split("/").at(-1)!; expect([S, C, T, mutation]).toContain(rpc); calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === mutation) expect(body).toEqual(save ? { input_working: { block_id: id, base_collection_revision: command.base_collection_revision,
      media_working: command.media_working } } : { input_intent: command });
    else expect(body).toEqual(rpc === T ? { input_block_id: id } : {});
    const data = rpc === S ? states.shift() : rpc === C ? context : rpc === T ? medias.shift() : reply;
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://sdk.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  const claim = (sub: unknown = subject) => ({ data: { claims: { sub } }, error: null }) as unknown as Awaited<ReturnType<typeof client.auth.getClaims>>;
  // Controlled SSR factory/claims; actual body reader, dispatcher, reviews and pinned SDK.
  const claims = vi.spyOn(client.auth, "getClaims").mockResolvedValue(claim()); server.mockResolvedValueOnce(client);
  const controller = new AbortController();
  const request = new Request(`${origin}/fixture`, { method: "POST", signal: controller.signal,
    headers: { origin, host: "editor.example.test", "content-type": "application/json" }, body: JSON.stringify(command) });
  const permit = vi.fn<(_: "identity_media_command", signal: AbortSignal) => Promise<unknown>>(async () => true);
  return { client, request, controller, permit, command, mutation, status, revision, context, row, snapshot, states, medias, claims, claim, calls, fetcher,
    run: (r: Request = request) => handle(r, origin, permit), setReply: (value: unknown) => { reply = value; } };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); server.mockReset(); });
function headers(r: Response) {
  expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8"); expect(r.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(r.headers.get("pragma")).toBe("no-cache"); expect(r.headers.get("expires")).toBe("0"); expect(r.headers.get("referrer-policy")).toBe("no-referrer"); expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  for (const name of ["location", "set-cookie", "access-control-allow-origin", "authorization"]) expect(r.headers.has(name)).toBe(false);
}
for (const action of actions) {
  it(`${action} uses one request-local factory and actual guarded execution before private JSON`, async () => {
    const f = fixture(action), r = await f.run(); headers(r); expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: f.status, block_id: id, collection_revision: f.revision,
      readback: { status: "current", relation: "same_revision", snapshot: { ...f.snapshot, block: { ...f.row, issues: [] } } } });
    expect(server).toHaveBeenCalledTimes(1); expect(server).toHaveBeenCalledWith(); expect(f.permit).toHaveBeenCalledTimes(1); expect(f.claims).toHaveBeenCalledTimes(8);
    expect(f.calls).toEqual([S, S, f.mutation, S, S, S, C, T, S, C, T, S, S]);
  });
  it.each([null, {}, { status: "success", block_id: id, collection_revision: 99 }])(`${action} unknown acknowledgment %j is503 status-only, no readback`, async reply => {
    const f = fixture(action); f.setReply(reply); const r = await f.run(); headers(r); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toEqual([S, S, f.mutation]);
  });
  it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable", "invalid"]) (`${action} maps known %s without fallback`, async status => {
    const f = fixture(action), actual = status === "invalid" ? action === "add_media_block" ? "invalid_add_intent" : action === "save_media_block" ? "invalid_media_working" : "invalid_initialization_intent" : status;
    f.setReply({ status: actual }); const r = await f.run(); headers(r);
    expect(r.status).toBe(status === "unauthenticated" ? 401 : status === "unavailable" ? 503 : status === "invalid" ? 400 : 403);
    expect(await r.json()).toEqual({ status: actual }); expect(f.calls).toEqual([S, S, f.mutation]);
  });
  it(`${action} explicit conflict is409 and never tries another operation`, async () => {
    const f = fixture(action), status = action === "initialize_media_block" ? "already_initialized" : "stale_write"; f.setReply({ status });
    const r = await f.run(); headers(r); expect(r.status).toBe(409); expect(await r.json()).toEqual({ status }); expect(f.calls).toEqual([S, S, f.mutation]);
  });
  for (const phase of [0, 2, 7]) it(`${action} claim loss at phase${phase} strips all private data`, async () => {
    const f = fixture(action); for (let i = 0; i < phase; i++) f.claims.mockResolvedValueOnce(f.claim()); f.claims.mockResolvedValueOnce(f.claim(null));
    const r = await f.run(); headers(r); expect(r.status).toBe(phase === 0 ? 401 : 503); expect(await r.json()).toEqual({ status: phase === 0 ? "unauthenticated" : "outcome_unknown" });
  });
  it(`${action} readback failure retains only known guarded acknowledgment`, async () => {
    const f = fixture(action); f.medias[0] = { status: "unavailable" }; const r = await f.run(); headers(r); expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: f.status, block_id: id, collection_revision: f.revision, readback: { status: "unavailable" } });
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
  const f = fixture(), g = fixture("initialize_media_block"); const other = "90000000-0000-4000-8000-000000000004";
  g.claims.mockResolvedValue(g.claim(other)); g.states.fill({ ...active, owner_id: other });
  g.medias.fill({ ...g.snapshot, current_handle: "second-owner" });
  // Context must agree in both independently complete observations.
  const original = g.fetcher.getMockImplementation()!;
  g.fetcher.mockImplementation(async (input, options) => String(input).endsWith(C)
    ? new Response(JSON.stringify({ ...g.context, current_handle: "second-owner" }), { headers: { "content-type": "application/json" } }) : original(input, options));
  const [a, b] = await Promise.all([f.run(), g.run()]); headers(a); headers(b); expect(server).toHaveBeenCalledTimes(2);
  const first = await a.json(), second = await b.json(); expect(first.status).toBe("allocated"); expect(second.status).toBe("initialized");
  expect(first.readback.snapshot.current_handle).toBe("http-owner"); expect(second.readback.snapshot.current_handle).toBe("second-owner");
  expect(f.calls.filter(x => x === f.mutation)).toHaveLength(1); expect(g.calls.filter(x => x === g.mutation)).toHaveLength(1);
});

for (const action of actions) {
  it.each([null, "", " \t\r\n ", "<script>raw()</script>", "\u0001".repeat(2048), "🐈".repeat(2048)])(`${action} serializes bounded raw Media as JSON only`, async value => {
    for (const asset_key of [null, "abcdef00-0000-4000-8000-000000000003"]) {
      const f = fixture(action);
      const raw = { asset_key, alt_text: value }; Object.assign(f.command.media_working, raw);
      f.medias.fill({ ...f.snapshot, block: { ...f.row, asset_state: asset_key === null ? "not_selected" : "registered", media_working: raw } });
      const request = new Request(f.request.url, { method: "POST", headers: f.request.headers, body: JSON.stringify(f.command) });
      const r = await f.run(request); headers(r); expect(r.status).toBe(200); const body = await r.text();
      expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(32768);
      expect(JSON.parse(body).readback.snapshot.block.media_working).toEqual(raw);
      expect(f.calls).toHaveLength(13); expect(f.claims).toHaveBeenCalledTimes(8);
    }
  });
  it(`${action} exposes newer selected observation separately from original acknowledgment`, async () => {
    const f = fixture(action); f.medias.fill({ ...f.snapshot, collection_revision: f.revision + 1, block: { ...f.row, media_working: null, payload_state: "missing", asset_state: "not_selected" } });
    const r = await f.run(); headers(r); expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: f.status, collection_revision: f.revision,
      readback: { status: "current", relation: "newer_revision", snapshot: { collection_revision: f.revision + 1 } } });
  });
  it(`${action} controlled serializer expansion retains only guarded ack without partial snapshot`, async () => {
    const f = fixture(action), stringify = JSON.stringify;
    vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const body = stringify(...args), value = args[0];
      return value?.status === f.status && value?.readback?.status === "current" ? body + " ".repeat(32768) : body;
    });
    const r = await f.run(); headers(r); expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: f.status, block_id: id, collection_revision: f.revision, readback: { status: "unavailable" } });
    expect(f.calls).toHaveLength(13);
  });
  it.each(["throw", "abort", "headers", "elapsed"])(`${action} serialization %s cannot leak a stale success`, async reason => {
    const f = fixture(action), stringify = JSON.stringify; let now = 0;
    if (reason === "elapsed") vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(JSON, "stringify").mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const value = args[0];
      if (value?.status === f.status && value?.readback?.status === "current") {
        if (reason === "throw") throw new Error("private serialization detail");
        if (reason === "abort") f.controller.abort(); else if (reason === "headers") f.request.headers.set("host", "evil.test"); else now = 20001;
      }
      return stringify(...args);
    });
    const r = await f.run(); headers(r); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "outcome_unknown" });
    expect(f.calls).toHaveLength(13);
  });
  it.each(["subject", "owner"])(`${action} final ${"%s"} drift strips acknowledgment and selected raw Media`, async reason => {
    const f = fixture(action);
    if (reason === "owner") f.states[7] = { ...active, owner_id: id };
    else { for (let i = 0; i < 7; i++) f.claims.mockResolvedValueOnce(f.claim()); f.claims.mockResolvedValueOnce(f.claim(id)); }
    const r = await f.run(); headers(r); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "outcome_unknown" });
  });
}
it.each(["block_not_found", "unsupported_block_kind", "revision_exhausted", "stale_write"])("save target precondition %s is explicit409 without fallback", async status => {
  const f = fixture("save_media_block"); f.setReply({ status }); const r = await f.run(); headers(r); expect(r.status).toBe(409);
  expect(await r.json()).toEqual({ status }); expect(f.calls).toEqual([S, S, f.mutation]);
});
it("fixed permit runs before one zero-argument SSR factory with no body-selected budget", async () => {
  const f = fixture("save_media_block"); f.permit.mockImplementation(async (action, signal) => {
    expect(action).toBe("identity_media_command"); expect(signal.aborted).toBe(false); expect(server).not.toHaveBeenCalled(); return true;
  });
  expect((await f.run()).status).toBe(200); expect(f.permit).toHaveBeenCalledTimes(1); expect(server).toHaveBeenCalledWith();
});
it("aborted request is503 without permit/factory/claims, with private headers and listener cleanup", async () => {
  const f = fixture(); f.controller.abort(); const remove = vi.spyOn(f.request.signal, "removeEventListener"); const r = await f.run();
  headers(r); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "unavailable" });
  expect(server).not.toHaveBeenCalled(); expect(f.permit).not.toHaveBeenCalled(); expect(f.calls).toEqual([]);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
});

for (const action of actions) it(`${action} invalid_asset is400 without another mutation`, async () => {
  const f = fixture(action); f.setReply({ status: "invalid_asset" });
  const r = await f.run(); headers(r); expect(r.status).toBe(400);
  expect(await r.json()).toEqual({ status: "invalid_asset" }); expect(f.calls).toEqual([S, S, f.mutation]);
});

for (const action of actions) it(`${action} retains uppercase input and does not falsely equate normalized readback`, async () => {
  const f = fixture(action); f.command.media_working.asset_key = f.command.media_working.asset_key.toUpperCase();
  const request = new Request(f.request.url, { method: "POST", headers: f.request.headers, body: JSON.stringify(f.command) });
  const r = await f.run(request); headers(r); expect(r.status).toBe(200);
  expect(await r.json()).toEqual({ status: f.status, block_id: id, collection_revision: f.revision, readback: { status: "unavailable" } });
  expect(f.calls).toHaveLength(13); expect(f.claims).toHaveBeenCalledTimes(8);
});
