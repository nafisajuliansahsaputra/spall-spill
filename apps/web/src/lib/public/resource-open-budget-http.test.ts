import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { createBudgetedResourceOpenHttpBoundary } from "./resource-open-budget-http";
import { createResourceOpenUpstashBudgetTransport } from "./resource-open-budget-upstash";

const origin = "https://app.example.test";
const locator = { handle: "previous", reference: "#27" };
const context = { handle: "creator", spill_reference: 27 };
const source = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const request = (body: unknown) => new Request(`${origin}/staged`, { method: "POST",
  headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
function fixture() {
  const records = new Map<string, unknown>(); const recognition = { status: "success", current_handle: "creator", display_name: "Published Owner",
    spill_reference: 27, resource_type: "portfolio", title: "Published Portfolio", available: true, source_url: source };
  const sdkFetch = vi.fn<typeof fetch>(async (input, init) => {
    const name = String(input).split("/").at(-1)!; const args = JSON.parse(String(init?.body)); let result: unknown = null;
    expect(new Headers(init?.headers).get("content-profile")).toBe("api");
    if (name === "resolve_published_resource_context_server") result = { status: "success", recognition,
      binding: { ...context, publication_token: "a".repeat(64), source_hash: createHash("sha256").update(source).digest("hex") } };
    if (name === "read_resource_open_clock_server") result = 100000 + Math.floor(performance.now());
    if (name === "resolve_published_resource_source_server" || name === "resolve_resource_open_intent_source_server") result = { status: "success", source_url: source };
    if (name === "create_resource_open_intent_server") { records.set(args.input_token_hash, args.input_record); result = true; }
    if (name === "consume_resource_open_intent_server") { result = records.get(args.input_token_hash) ?? null; records.delete(args.input_token_hash); }
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://sdk-fixture.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: sdkFetch } });
  const rest = vi.fn<typeof fetch>(async () => new Response('{"result":1}', { headers: { "content-type": "application/json" } }));
  const identity = vi.fn(async (_request: Request): Promise<unknown> => "trusted-resource-subject");
  const policy = { namespace: "resource-test", window_ms: 60000, issue_limit: 100, redeem_limit: 100, work_limit: 1000 };
  const redis = createResourceOpenUpstashBudgetTransport({ origin: "https://fixture.upstash.io", namespace: policy.namespace,
    token: "test-only-bearer-placeholder" }, rest);
  const dependencies = { client, origin, redis, identity, policy };
  return { dependencies, http: createBudgetedResourceOpenHttpBoundary(dependencies), sdkFetch, rest, identity, records, recognition };
}
async function denial(response: Response) {
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ status: "unavailable" });
  expect(response.headers.get("Location")).toBeNull(); expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
}
it.each(["JSON", "native"] as const)("actual SDK/REST fixtures budget issue/%s redemption/replay independently with exact attribution", async media => {
  const f = fixture(); const first = request(locator); const issued = await f.http.issue(first);
  expect(issued.status).toBe(200); const payload = await issued.json(); expect(payload.recognition).toEqual(f.recognition);
  const redeemRequest = () => media === "JSON" ? request({ ...context, token: payload.token }) : new Request(`${origin}/staged`, {
    method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ handle: context.handle, spill_reference: "27", token: payload.token }) });
  const handler = media === "JSON" ? f.http.redeem : f.http.redeemForm;
  const second = redeemRequest(); const result = await handler(second); expect(result.status).toBe(303);
  expect(result.headers.get("Location")).toBe(source); expect(await result.text()).toBe(""); expect(f.records.size).toBe(0);
  const replay = redeemRequest(); await denial(await handler(replay));
  const commands = f.rest.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as string[]);
  expect(commands.map(c => c.at(-1))).toEqual(["4", "3", "3"]); expect(commands[0]![3]).toMatch(/^spall-resource-open:resource-test:\{[a-f0-9]{64}\}:issue$/);
  expect(commands.slice(1).every(c => c[3]!.endsWith(":redeem"))).toBe(true); expect(new Set(commands.map(c => c[4])).size).toBe(1);
  expect(commands.every(c => c[4]!.endsWith(":work") && !JSON.stringify(c).includes("trusted-resource-subject"))).toBe(true);
  expect(f.identity.mock.calls.map(([req]) => req)).toEqual([first, second, replay]); expect(f.sdkFetch).toHaveBeenCalledTimes(9);
  for (const [, init] of f.rest.mock.calls) {
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-only-bearer-placeholder");
    expect(init?.redirect).toBe("error"); expect(init?.cache).toBe("no-store"); expect(String(init?.body)).not.toContain("bearer-placeholder");
  }
});
it.each([0, "1", null, {}, true])("denies noncanonical/failed Redis result %j before SDK", async value => {
  const f = fixture(); f.rest.mockImplementation(async () => new Response(JSON.stringify({ result: value }), { headers: { "content-type": "application/json" } }));
  await denial(await f.http.issue(request(locator))); expect(f.sdkFetch).not.toHaveBeenCalled(); expect(f.records.size).toBe(0);
});
it("denies failed redemption budget without consuming stored intent", async () => {
  const f = fixture(); const payload = await (await f.http.issue(request(locator))).json(); f.sdkFetch.mockClear();
  f.rest.mockImplementation(async () => new Response('{"result":0}', { headers: { "content-type": "application/json" } }));
  await denial(await f.http.redeem(request({ ...context, token: payload.token }))); expect(f.records.size).toBe(1); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it.each(["policy", "redis", "identity"] as const)("fails closed with missing %s dependency", async missing => {
  const f = fixture(); Reflect.deleteProperty(f.dependencies, missing); const http = createBudgetedResourceOpenHttpBoundary(f.dependencies);
  await denial(await http.issue(request(locator))); expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it.each([null, "bad", { address: "192.0.2.1" }])("rejects untrusted/nonopaque identity %j before REST/SDK", async value => {
  const f = fixture(); f.identity.mockResolvedValue(value); await denial(await f.http.issue(request(locator)));
  expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it("checks origin before identity/REST/SDK despite forged forwarded identity", async () => {
  const f = fixture(); const req = request(locator); req.headers.set("Origin", "https://attacker.example.test"); req.headers.set("x-forwarded-for", "192.0.2.1");
  await denial(await f.http.issue(req)); expect(f.identity).not.toHaveBeenCalled(); expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it.each(["cost", "operation", "permit", "source_url", "provider_key"]) ("caller %s cannot alter selected issue cost or start RPC", async key => {
  const f = fixture(); await denial(await f.http.issue(request({ ...locator, [key]: key === "cost" ? 1 : "redeem" })));
  expect(JSON.parse(String(f.rest.mock.calls[0]![1]?.body)).at(-1)).toBe("4"); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it("does not boost insufficient issue capacity", async () => {
  const f = fixture(); f.dependencies.policy.work_limit = 3; await denial(await f.http.issue(request(locator)));
  expect(f.identity).not.toHaveBeenCalled(); expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
