import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createBudgetedIdentityContactEditorHttpBoundary as createBoundary } from "./identity-contact-editor-budget-http";
import { productClickBudgetScript } from "../public/product-click-budget";
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const server = vi.mocked(createServerClient), origin = "https://editor.example.test";
const subject = "90000000-0000-4000-8000-000000000001", owner = "90000000-0000-4000-8000-000000000002", id = "90000000-0000-4000-8000-000000000003";
const active = { status: "active", owner_id: owner, account_state: "active", onboarding_completed: true };
const S = "resolve_current_owner_state", C = "resolve_current_owner_home_context", T = "resolve_current_owner_contact_block_working";
const actions = ["add_contact_block", "initialize_contact_block", "save_contact_block"] as const;
type Action = typeof actions[number];
function fixture(action: Action = "add_contact_block") {
  const init = action === "initialize_contact_block", save = action === "save_contact_block", revision = init ? 1 : 4;
  const raw = { contact_type: "email", label: " <Raw> 😀 ", value: "unfinished target" };
  const command = { action, base_collection_revision: init ? null : 3,
    ...(save ? { block_id: id } : { is_visible: false }), contact_working: { kind: "contact", ...raw } };
  const mutation = init ? "initialize_current_owner_blocks_from_contact" : save ? "save_current_owner_block_contact_working" : "add_current_owner_contact_block_working";
  const status = init ? "initialized" : save ? "saved" : "allocated";
  const context = { status: "success", current_handle: "http-owner", primary_use_case: "personal" };
  const row = { block_id: id, kind: "contact", position: init ? 1 : 7, is_visible: save, payload_state: "present", contact_working: raw };
  const snapshot = { ...context, collection_revision: revision, block: row };
  const states: unknown[] = Array.from({ length: 8 }, () => active), contacts: unknown[] = [snapshot, snapshot], calls: string[] = [];
  let reply: unknown = { status: "success", block_id: id, collection_revision: revision };
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://sdk.example.test"); expect(options!.method).toBe("POST");
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.signal).toBeDefined();
    expect(new Headers(options!.headers).get("authorization")).not.toBe("Bearer test-only-bearer-placeholder");
    const rpc = url.pathname.split("/").at(-1)!; expect([S, C, T, mutation]).toContain(rpc); calls.push(rpc);
    const body = JSON.parse(String(options!.body));
    if (rpc === mutation) expect(body).toEqual(save ? { input_working: { block_id: id, base_collection_revision: command.base_collection_revision,
      contact_working: command.contact_working } } : { input_intent: command });
    else expect(body).toEqual(rpc === T ? { input_block_id: id } : {});
    const data = rpc === S ? states.shift() : rpc === C ? context : rpc === T ? contacts.shift() : reply;
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
  const config = { trustedOrigin: origin, policy: { namespace: "editor-test", window_ms: 60000, command_limit: 10, work_limit: 130 },
    upstash: { origin: "https://budget-fixture.upstash.io", token: "test-only-bearer-placeholder" } };
  const key = new Uint8Array(32).fill(7), readTrustedMetadata = vi.fn(async (): Promise<unknown> => ({ address: "192.0.2.1" }));
  const budgetFetch = vi.fn<typeof fetch>(async () => new Response('{"result":1}', { headers: { "content-type": "application/json" } }));
  const dependencies = { key, readTrustedMetadata, fetcher: budgetFetch }, handle = createBoundary(config, dependencies);
  return { client, request, controller, config, key, readTrustedMetadata, budgetFetch, dependencies, command, mutation, status, revision, context, row, snapshot, states, contacts, claims, claim, calls, fetcher,
    run: (r: Request = request) => handle(r), setReply: (value: unknown) => { reply = value; } };

}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); server.mockReset(); });
function headers(r: Response) {
  expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8"); expect(r.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  expect(r.headers.get("pragma")).toBe("no-cache"); expect(r.headers.get("expires")).toBe("0"); expect(r.headers.get("referrer-policy")).toBe("no-referrer"); expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  for (const name of ["location", "set-cookie", "access-control-allow-origin", "authorization"]) expect(r.headers.has(name)).toBe(false);
}

for (const action of actions) {
  it(`${action} composes one Contact EVAL before actual guarded SDK execution`, async () => {
    const f = fixture(action), reader = vi.spyOn(f.request.body!, "getReader"), r = await f.run(); headers(r); expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ status: f.status, collection_revision: f.revision, readback: { status: "current", snapshot: { block: { contact_working: f.row.contact_working } } } });
    expect(f.calls).toEqual([S, S, f.mutation, S, S, S, C, T, S, C, T, S, S]); expect(f.claims).toHaveBeenCalledTimes(8); expect(server).toHaveBeenCalledExactlyOnceWith();
    expect(f.budgetFetch).toHaveBeenCalledTimes(1); const [url, init] = f.budgetFetch.mock.calls[0]!;
    expect(url).toBe(`${f.config.upstash.origin}/`); const wire = JSON.parse(String(init?.body));
    expect(wire.slice(0, 3)).toEqual(["eval", productClickBudgetScript, 2]); expect(wire[3]).toMatch(/^spall-identity-contact-editor:editor-test:\{[a-f0-9]{64}\}:command$/);
    expect(wire[4]).toBe(wire[3].replace(/:command$/, ":work")); expect(wire.slice(5)).toEqual(["60000", "10", "130", "13"]);
    expect(String(init?.body)).not.toContain(f.config.upstash.token); expect(String(init?.body)).not.toContain("192.0.2.1");
    expect(f.readTrustedMetadata.mock.invocationCallOrder[0]).toBeLessThan(f.budgetFetch.mock.invocationCallOrder[0]!);
    expect(f.budgetFetch.mock.invocationCallOrder[0]).toBeLessThan(reader.mock.invocationCallOrder[0]!); expect(reader.mock.invocationCallOrder[0]).toBeLessThan(server.mock.invocationCallOrder[0]!);
  });
  it(`${action} preserves post-dispatch unknown and final claim loss`, async () => {
    const f = fixture(action); for(let i=0;i<7;i++)f.claims.mockResolvedValueOnce(f.claim()); f.claims.mockResolvedValueOnce(f.claim(null));
    const r = await f.run(); expect(r.status).toBe(503); expect(await r.json()).toEqual({ status: "outcome_unknown" }); expect(f.budgetFetch).toHaveBeenCalledTimes(1);
  });
}
it.each(["owner", "permit", "client", "namespace", "policy", "upstash-namespace", "null"])("rejects invalid config %s before I/O", async reason => {
  const f = fixture(); let config: unknown = structuredClone(f.config);
  if(reason === "null") config=null;
  else if(reason === "policy") Reflect.set(config as object,"policy",{...f.config.policy,work_limit:12});
  else if(reason === "upstash-namespace") Reflect.set((config as typeof f.config).upstash,"namespace","forged");
  else Reflect.set(config as object,reason,"forged");
  const r=await createBoundary(config as typeof f.config,f.dependencies)(f.request); headers(r); expect(r.status).toBe(403);
  expect(f.readTrustedMetadata).not.toHaveBeenCalled();expect(f.budgetFetch).not.toHaveBeenCalled();expect(server).not.toHaveBeenCalled();expect(f.request.bodyUsed).toBe(false);
});
it.each(["origin", "token", "key", "reader", "denial", "error", "metadata"])("denies server/provider %s before SSR", async reason => {
  const f=fixture();
  if(reason==="origin")f.config.upstash.origin="https://evil.test";
  if(reason==="token")f.config.upstash.token="short";
  if(reason==="key")f.dependencies.key=new Uint8Array(31);
  if(reason==="reader")Reflect.set(f.dependencies,"readTrustedMetadata",undefined);
  if(reason==="denial")f.budgetFetch.mockResolvedValue(new Response('{"result":0}',{headers:{"content-type":"application/json"}}));
  if(reason==="error")f.budgetFetch.mockRejectedValue(new Error("private"));
  if(reason==="metadata")f.request.headers.set("origin","https://evil.test");
  const r=await createBoundary(f.config,f.dependencies)(f.request);headers(r);expect(r.status).toBe(403);expect(await r.json()).toEqual({status:"unavailable"});expect(server).not.toHaveBeenCalled();expect(f.request.bodyUsed).toBe(false);
});
it("snapshots config/key and uses distinct request-local SSR clients concurrently", async()=>{
  const f=fixture(),g=fixture("initialize_contact_block");
  const other="90000000-0000-4000-8000-000000000004";g.claims.mockResolvedValue(g.claim(other));g.states.fill({...active,owner_id:other});
  g.context.current_handle="second-owner";g.contacts.fill({...g.snapshot,current_handle:"second-owner"});
  f.config.trustedOrigin="https://evil.test";f.config.policy.namespace="other";f.config.upstash.token="short";f.key.fill(9);
  const [a,b]=await Promise.all([f.run(),f.run(g.request)]);expect(a.status).toBe(200);expect(b.status).toBe(200);expect(server).toHaveBeenCalledTimes(2);
  const first=await a.json(),second=await b.json();expect(first.status).toBe("allocated");expect(second.status).toBe("initialized");
  expect(first.readback.snapshot.current_handle).toBe("http-owner");expect(second.readback.snapshot.current_handle).toBe("second-owner");expect(f.budgetFetch).toHaveBeenCalledTimes(2);expect(g.budgetFetch).not.toHaveBeenCalled();
  expect(f.budgetFetch.mock.calls[0]![1]?.body).toBe(f.budgetFetch.mock.calls[1]![1]?.body);
  const subject = createHmac("sha256", new Uint8Array(32).fill(7)).update(["spall-identity-contact-editor-network-subject-v1", "editor-test", "4:192.0.2.1"].join("\0")).digest("base64url");
  const digest = createHash("sha256").update(`editor-test\0${subject}`).digest("hex");
  expect(JSON.parse(String(f.budgetFetch.mock.calls[0]![1]?.body))[3]).toBe(`spall-identity-contact-editor:editor-test:{${digest}}:command`);
  expect(f.claims).toHaveBeenCalledTimes(8);expect(g.claims).toHaveBeenCalledTimes(8);

});
it.each(["abort", "timeout"])("pending provider %s never creates late SSR client",async reason=>{
  vi.useFakeTimers();const f=fixture();let finish!:(value:Response)=>void;
  f.budgetFetch.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const pending=f.run();await vi.advanceTimersByTimeAsync(0);
  if(reason==="abort")f.controller.abort();else await vi.advanceTimersByTimeAsync(1500);
  const r=await pending;expect(r.status).toBe(reason==="abort"?503:403);expect(server).not.toHaveBeenCalled();
  finish(new Response('{"result":1}',{headers:{"content-type":"application/json"}}));await vi.advanceTimersByTimeAsync(2000);expect(server).not.toHaveBeenCalled();expect(f.request.bodyUsed).toBe(false);expect(vi.getTimerCount()).toBe(0);
});

it.each(["malformed", "selector"])("body %s may burn one grant but cannot create SSR client",async reason=>{
  const f=fixture();const req=new Request(f.request.url,{method:"POST",headers:f.request.headers,
    body:reason==="malformed"?"{":JSON.stringify({...f.command,owner_id:owner})});
  const r=await f.run(req);headers(r);expect(r.status).toBe(403);expect(await r.json()).toEqual({status:"unavailable"});
  expect(f.budgetFetch).toHaveBeenCalledTimes(1);expect(server).not.toHaveBeenCalled();expect(f.calls).toEqual([]);
});

for(const action of actions) {
  it.each([null,"email","whatsapp","phone"] as const)(`${action} retains raw Contact type %s through the budgeted pipeline`,async contact_type=>{
    for(const value of [null,""," \r\n ","<script>raw()</script>","\u0001".repeat(2048),"🐈".repeat(2048)]) {
      const f=fixture(action),label=value===null?null:value.startsWith("\u0001")?"\u0001".repeat(512):value.startsWith("🐈")?"🐈".repeat(512):value.slice(0,100);
      const raw={contact_type,label,value};Object.assign(f.command.contact_working,raw);
      f.contacts.fill({...f.snapshot,block:{...f.row,contact_working:raw}});
      const req=new Request(f.request.url,{method:"POST",headers:f.request.headers,body:JSON.stringify(f.command)});
      const r=await f.run(req);headers(r);expect(r.status).toBe(200);const body=await r.text();
      expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(32768);
      expect(JSON.parse(body).readback.snapshot.block.contact_working).toEqual(raw);
      expect(f.budgetFetch).toHaveBeenCalledTimes(1);expect(f.claims).toHaveBeenCalledTimes(8);expect(f.calls).toHaveLength(13);
    }
  });
}
for(const action of actions) {
  it(`${action} retains a charged explicit conflict without fallback`,async()=>{
    const f=fixture(action),status=action==="initialize_contact_block"?"already_initialized":"stale_write";
    f.setReply({status});const r=await f.run();headers(r);expect(r.status).toBe(409);
    expect(await r.json()).toEqual({status});expect(f.budgetFetch).toHaveBeenCalledTimes(1);
    expect(f.calls).toEqual([S,S,f.mutation]);
  });
  it(`${action} never promotes an unknown acknowledgment after a network grant`,async()=>{
    const f=fixture(action);f.setReply(null);const r=await f.run();headers(r);expect(r.status).toBe(503);
    expect(await r.json()).toEqual({status:"outcome_unknown"});expect(f.budgetFetch).toHaveBeenCalledTimes(1);
    expect(f.calls).toEqual([S,S,f.mutation]);
  });
}
