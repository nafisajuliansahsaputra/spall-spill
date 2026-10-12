import { createHash, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { createNetworkBudgetedResourceOpenHttpBoundary } from "./resource-open-network-http";
import { createResourceOpenUpstashBudgetTransport } from "./resource-open-budget-upstash";

const origin = "https://app.example.test";
const locator = { handle: "previous", reference: "#27" };
const context = { handle: "creator", spill_reference: 27 };
const source = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const request = (body: unknown) => new Request(`${origin}/staged`, { method: "POST",
  headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
function fixture(metadata: unknown = { address: "192.0.2.1" }, overrides: Record<string, unknown> = {}) {
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
  const readTrustedMetadata = vi.fn<(request: Request) => Promise<unknown>>(async () => metadata);
  const key = new Uint8Array(32).fill(7);
  const policy = { namespace: "resource-test", window_ms: 60000, issue_limit: 100, redeem_limit: 100, work_limit: 1000 };
  const redis = createResourceOpenUpstashBudgetTransport({ origin: "https://fixture.upstash.io", namespace: policy.namespace,
    token: "test-only-bearer-placeholder" }, rest);
  const dependencies = { client, origin, redis, readTrustedMetadata, key, policy };
  Object.assign(dependencies, overrides);
  return { dependencies, http: createNetworkBudgetedResourceOpenHttpBoundary(dependencies), sdkFetch, rest, readTrustedMetadata, key, records, recognition };
}
async function denial(response: Response) {
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ status: "unavailable" });
  expect(response.headers.get("Location")).toBeNull(); expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
}
it.each(["JSON", "native"] as const)("actual SDK/REST fixtures compose trusted Resource identity for %s redemption/replay", async media => {
  const f = fixture(); const first = request(locator); first.headers.set("x-forwarded-for", "203.0.113.9");
  const issued = await f.http.issue(first); expect(issued.status).toBe(200); const payload = await issued.json(); expect(payload.recognition).toEqual(f.recognition);
  f.readTrustedMetadata.mockResolvedValue({ address: "::ffff:192.0.2.1" });
  const makeRequest = () => media === "JSON" ? request({ ...context, token: payload.token }) : new Request(`${origin}/staged`, {
    method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ handle: "creator", spill_reference: "27", token: payload.token }) });
  const handler = media === "JSON" ? f.http.redeem : f.http.redeemForm;
  const second = makeRequest(); const response = await handler(second); expect(response.status).toBe(303); expect(response.headers.get("Location")).toBe(source);
  expect(await response.text()).toBe(""); const replay = makeRequest(); await denial(await handler(replay)); expect(f.records.size).toBe(0);
  expect(f.readTrustedMetadata.mock.calls.map(([req]) => req)).toEqual([first, second, replay]);
  const commands = f.rest.mock.calls.map(([, init]) => JSON.parse(String(init?.body)) as string[]);
  const subject = createHmac("sha256", new Uint8Array(32).fill(7)).update(["spall-resource-open-network-subject-v1", "resource-test", "4:192.0.2.1"].join("\0")).digest("base64url");
  const digest = createHash("sha256").update(`resource-test\0${subject}`).digest("hex");
  expect(commands.map(c => c.at(-1))).toEqual(["4", "3", "3"]);
  expect(commands.map(c => c[3])).toEqual([`spall-resource-open:resource-test:{${digest}}:issue`, ...Array<string>(2).fill(`spall-resource-open:resource-test:{${digest}}:redeem`)]);
  expect(new Set(commands.map(c => c[4]))).toEqual(new Set([`spall-resource-open:resource-test:{${digest}}:work`]));
  expect(JSON.stringify(commands)).not.toContain("192.0.2.1"); expect(f.sdkFetch).toHaveBeenCalledTimes(9);
});
it("snapshots policy namespace/capacity and key before external mutation", async () => {
  const f = fixture(); f.dependencies.policy.namespace = "changed"; f.dependencies.policy.work_limit = 1; f.key.fill(9);
  expect((await f.http.issue(request(locator))).status).toBe(200);
  const command = JSON.parse(String(f.rest.mock.calls[0]![1]?.body)); expect(command[3]).toMatch(/^spall-resource-open:resource-test:/); expect(command.at(-2)).toBe("1000");
  const subject = createHmac("sha256", new Uint8Array(32).fill(7)).update(["spall-resource-open-network-subject-v1", "resource-test", "4:192.0.2.1"].join("\0")).digest("base64url");
  expect(command[3]).toContain(createHash("sha256").update(`resource-test\0${subject}`).digest("hex"));
});
it.each(["key", "readTrustedMetadata", "policy", "redis"] as const)("fails closed with missing %s", async missing => {
  const f = fixture(); Reflect.deleteProperty(f.dependencies, missing); const http = createNetworkBudgetedResourceOpenHttpBoundary(f.dependencies);
  await denial(await http.issue(request(locator))); expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it.each([null, {}, { address: "example.test" }, { address: "192.0.2.1", extra: true }, { address: "fe80::1%eth0" }])("denies invalid trusted metadata %j despite spoofed headers", async metadata => {
  const f = fixture(metadata); const req = request(locator); req.headers.set("x-real-ip", "192.0.2.1"); req.headers.set("forwarded", "for=192.0.2.1");
  await denial(await f.http.issue(req)); expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it.each([{ key: new Uint8Array(31) }, { key: new Uint8Array(65) }, { policy: { namespace: "bad{}" } }])("denies invalid private dependency %j", async overrides => {
  const f = fixture(undefined, overrides); await denial(await f.http.issue(request(locator))); expect(f.readTrustedMetadata).not.toHaveBeenCalled(); expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it("checks Origin before trusted metadata, REST and SDK", async () => {
  const f = fixture(); const req = request(locator); req.headers.set("Origin", "https://attacker.example.test");
  await denial(await f.http.issue(req)); expect(f.readTrustedMetadata).not.toHaveBeenCalled(); expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it("ignores unchecked identity/namespace/domain overrides instead of bypassing metadata", async () => {
  const forged = vi.fn(async () => "trusted-forged-subject");
  const f = fixture(null, { identity: forged, namespace: "forged", domain: "spall-click-network-subject-v1" });
  await denial(await f.http.issue(request(locator))); expect(forged).not.toHaveBeenCalled(); expect(f.readTrustedMetadata).toHaveBeenCalledTimes(1);
  expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
});
it("late trusted reader cannot start REST or SDK after HTTP denial", async () => {
  vi.useFakeTimers(); try {
    const f = fixture(); let finish!: (metadata: unknown) => void;
    f.readTrustedMetadata.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.http.issue(request(locator)); await vi.advanceTimersByTimeAsync(500); await denial(await pending);
    finish({ address: "192.0.2.1" }); await vi.advanceTimersByTimeAsync(0);
    expect(f.rest).not.toHaveBeenCalled(); expect(f.sdkFetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
