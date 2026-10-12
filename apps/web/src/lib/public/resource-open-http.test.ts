import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResourceOpenHttpBoundary } from "./resource-open-http";

const origin = "https://app.example.test";
const locator = { handle: "previous", reference: "#27" };
const context = { handle: "creator", spill_reference: 27 };
const originalUrl = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
function request(body: unknown, signal?: AbortSignal) {
  return new Request(`${origin}/staged-action`, { method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body), ...(signal ? { signal } : {}) });
}
function fixture(url = originalUrl) {
  const records = new Map<string, unknown>(); let safe = true; let clockOffset = 0;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const recognition = { status: "success", current_handle: "creator", display_name: "Published Owner", spill_reference: 27,
    resource_type: "portfolio", title: "Published Portfolio", available: true, source_url: url };
  const binding = { ...context, publication_token: "a".repeat(64), source_hash: createHash("sha256").update(url).digest("hex") };
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const name = String(input).split("/").at(-1)!; const args = JSON.parse(options!.body as string);
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    calls.push({ name, args }); let data: unknown = null;
    if (name === "resolve_published_resource_context_server") data = { status: "success", recognition, binding };
    if (name === "read_resource_open_clock_server") data = 100_000 + Math.floor(performance.now()) + clockOffset;
    if (name === "resolve_published_resource_source_server" || name === "resolve_resource_open_intent_source_server")
      data = safe ? { status: "success", source_url: url } : { status: "unavailable" };
    if (name === "create_resource_open_intent_server") { records.set(args.input_token_hash, args.input_record); data = true; }
    if (name === "consume_resource_open_intent_server") { data = records.get(args.input_token_hash) ?? null; records.delete(args.input_token_hash); }
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://http-fixture.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher },
  });
  const permit = vi.fn(async () => true);
  return { http: createResourceOpenHttpBoundary({ client, origin, permit }), permit, fetcher, records, calls, recognition,
    unsafe: () => { safe = false; }, expire: () => { clockOffset = 120_000; } };
}
function cacheTruth(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("Pragma")).toBe("no-cache"); expect(response.headers.get("Expires")).toBe("0");
  expect(response.headers.get("Referrer-Policy")).toBe("no-referrer"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.has("Access-Control-Allow-Origin")).toBe(false);
}
async function denial(response: Response) {
  expect(response.status).toBe(403); cacheTruth(response); expect(response.headers.has("Location")).toBe(false);
  expect(await response.json()).toEqual({ status: "unavailable" });
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("unmounted strict private Resource HTTP assembly", () => {
  it("uses actual SDK normalized context/clock/create/committed consume/final record resolver and exact Location", async () => {
    const f = fixture(); const first = request(locator); const response = await f.http.issue(first);
    expect(response.status).toBe(200); cacheTruth(response); expect(response.headers.has("Location")).toBe(false);
    const result = await response.json(); expect(Object.keys(result)).toEqual(["recognition", "token"]);
    expect(result.recognition).toEqual(f.recognition); expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const privateField of ["publication_token", "source_hash", "recognition_hash", "binding", "owner_id"])
      expect(JSON.stringify(result)).not.toContain(privateField);
    const record = [...f.records.values()][0]; const second = request({ ...context, token: result.token });
    const outbound = await f.http.redeem(second); expect(outbound.status).toBe(303); cacheTruth(outbound);
    expect(outbound.headers.get("Location")).toBe(originalUrl); expect(await outbound.text()).toBe(""); expect(f.records.size).toBe(0);
    expect(f.calls.map(c => c.name)).toEqual(["resolve_published_resource_context_server", "read_resource_open_clock_server",
      "resolve_published_resource_source_server", "create_resource_open_intent_server", "read_resource_open_clock_server",
      "consume_resource_open_intent_server", "resolve_resource_open_intent_source_server"]);
    expect(f.calls[0]!.args).toEqual({ input_handle: "previous", input_spill_reference: 27 });
    expect(f.calls.at(-1)!.args).toEqual({ input_record: record });
    expect(f.permit).toHaveBeenNthCalledWith(1, first, "issue"); expect(f.permit).toHaveBeenNthCalledWith(2, second, "redeem");
    await denial(await f.http.redeem(request({ ...context, token: result.token })));
  });
  it("canonicalizes protected aliases only through trusted Published recognition", async () => {
    const f = fixture(); const issued = await f.http.issue(request({ ...locator, handle: "OLD-HANDLE" })); expect(issued.status).toBe(200);
    const result = await issued.json(); expect(result.recognition.current_handle).toBe("creator");
    expect(f.calls[0]!.args.input_handle).toBe("old-handle");
    expect((await f.http.redeem(request({ ...context, token: result.token }))).status).toBe(303);
  });
  it.each([null, {}, { ...locator, reference: 27 }, { ...locator, reference: "027" }, { ...locator, source_url: originalUrl },
    { ...locator, provider_key: "shopee" }, { ...locator, owner_id: "forged" }, { ...locator, binding: {} },
    { ...locator, recognition: {} }, { ...locator, publication_token: "a".repeat(64) }, { ...locator, token: "forged" }])
    ("denies invalid/private/Product issuance before RPC %j", async body => {
      const f = fixture(); await denial(await f.http.issue(request(body))); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each([null, {}, { ...context, token: "bad" }, { ...context, token: "A".repeat(42) + "B" },
    { ...context, token: "A".repeat(43), spill_reference: "27" }, { ...context, token: "A".repeat(43), source_url: originalUrl },
    { ...context, token: "A".repeat(43), provider_key: "shopee" }, { ...context, token: "A".repeat(43), input_record: {} }])
    ("denies malformed/private/Product redemption before RPC %j", async body => {
      const f = fixture(); await denial(await f.http.redeem(request(body))); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each([{ handle: "another" }, { spill_reference: 28 }])("burns cross-context token without final resolution %j", async other => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    await denial(await f.http.redeem(request({ ...context, ...other, token: result.token }))); expect(f.records.size).toBe(0);
    expect(f.calls.at(-1)!.name).toBe("consume_resource_open_intent_server");
    await denial(await f.http.redeem(request({ ...context, token: result.token })));
  });
  it.each(["unsafe", "expired"])("denies fresh %s state and never restores consumption", async state => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    if (state === "unsafe") f.unsafe(); else f.expire();
    await denial(await f.http.redeem(request({ ...context, token: result.token }))); expect(f.records.size).toBe(0);
  });
  it("denies failed calibration before consume and retains existing record", async () => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    f.fetcher.mockResolvedValueOnce(new Response("null"));
    await denial(await f.http.redeem(request({ ...context, token: result.token }))); expect(f.records.size).toBe(1);
    expect(f.calls.at(-1)!.name).toBe("create_resource_open_intent_server");
  });
  it.each([null, 1, "true", {}])("requires literal creation acknowledgement %j", async data => {
    const f = fixture(); const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, options) => {
      const response = await normal(input, options);
      return String(input).endsWith("create_resource_open_intent_server") ? new Response(JSON.stringify(data)) : response;
    });
    await denial(await f.http.issue(request(locator))); expect(f.records.size).toBe(1); expect(f.calls).toHaveLength(4);
  });
  it("denies provider error without detail or retry", async () => {
    const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: "private database detail" }), { status: 403 }));
    await denial(await f.http.issue(request(locator))); expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("denies Origin, permit and pre-abort before any RPC", async () => {
    const f = fixture(); const r = request(locator); r.headers.set("origin", "https://evil.test");
    await denial(await f.http.issue(r)); expect(f.permit).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
    f.permit.mockResolvedValueOnce(false); await denial(await f.http.issue(request(locator))); expect(f.fetcher).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort(); await denial(await f.http.issue(request(locator, controller.signal)));
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(["issue", "redeem"] as const)("denies native form media for %s before RPC", async action => {
    const f = fixture(); const r = new Request(`${origin}/staged-action`, { method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: "handle=creator&reference=27" });
    await denial(await f.http[action](r)); expect(f.permit).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on unsupported Location encoding after burning consumption", async () => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    const set = Headers.prototype.set;
    vi.spyOn(Headers.prototype, "set").mockImplementation(function (this: Headers, name, value) {
      if (name === "Location") throw new TypeError("unsupported header encoding");
      return set.call(this, name, value);
    });
    await denial(await f.http.redeem(request({ ...context, token: result.token }))); expect(f.records.size).toBe(0);
  });
  it("denies unnormalized Unicode source before creation", async () => {
    const f = fixture("https://portfolio.example.test/☃?creator=original");
    await denial(await f.http.issue(request(locator))); expect(f.records.size).toBe(0);
  });
  it("denies request abortion after committed consume with no Location or restoration", async () => {
    const f = fixture(); const result = await (await f.http.issue(request(locator))).json(); const controller = new AbortController();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, options) => {
      const response = await normal(input, options);
      if (String(input).endsWith("consume_resource_open_intent_server")) controller.abort();
      return response;
    });
    await denial(await f.http.redeem(request({ ...context, token: result.token }, controller.signal))); expect(f.records.size).toBe(0);
  });
  it("keeps committed consumption burned when its response stalls", async () => {
    vi.useFakeTimers(); const f = fixture(); const result = await (await f.http.issue(request(locator))).json();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, options) => {
      const response = await normal(input, options);
      return String(input).endsWith("consume_resource_open_intent_server") ? new Promise(() => {}) : response;
    });
    const pending = f.http.redeem(request({ ...context, token: result.token })); await vi.advanceTimersByTimeAsync(10000);
    await denial(await pending); expect(f.records.size).toBe(0); expect(f.calls.at(-1)!.name).toBe("consume_resource_open_intent_server");
  });
  it("bounds aggregate core time even when individual RPCs finish in time and creation commits late", async () => {
    vi.useFakeTimers(); const f = fixture(); const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, options) => {
      if (!String(input).endsWith("read_resource_open_clock_server")) await new Promise(resolve => setTimeout(resolve, 4000));
      return normal(input, options);
    });
    const pending = f.http.issue(request(locator)); await vi.advanceTimersByTimeAsync(10000);
    await denial(await pending); expect(f.records.size).toBe(0);
    await vi.advanceTimersByTimeAsync(2000); expect(f.records.size).toBe(1); expect(f.calls).toHaveLength(4);
    const record = [...f.records.values()][0] as { issued_at: number; expires_at: number };
    expect(record.expires_at - record.issued_at).toBe(120_000);
    expect((await pending).status).toBe(403); expect((await pending).headers.has("Location")).toBe(false);
  });
});

function formRequest(fields: Record<string, unknown>, signal?: AbortSignal) {
  return new Request(`${origin}/staged-action`, { method: "POST", headers: { origin,
    "content-type": "application/x-www-form-urlencoded", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" },
    body: new URLSearchParams(Object.entries(fields).map(([key, value]) => [key, String(value)])), ...(signal ? { signal } : {}) });
}
describe("unmounted native Resource redemption assembly", () => {
  it("redeems through actual SDK committed record with exact Location and replay denial", async () => {
    const f = fixture(); const issued = await (await f.http.issue(request(locator))).json(); const stored = [...f.records.values()][0];
    const native = formRequest({ ...context, token: issued.token }); const response = await f.http.redeemForm(native);
    expect(response.status).toBe(303); cacheTruth(response); expect(response.headers.get("Location")).toBe(originalUrl);
    expect(await response.text()).toBe(""); expect(f.records.size).toBe(0); expect(f.permit).toHaveBeenLastCalledWith(native, "redeem");
    expect(f.calls.at(-1)).toEqual({ name: "resolve_resource_open_intent_source_server", args: { input_record: stored } });
    await denial(await f.http.redeemForm(formRequest({ ...context, token: issued.token })));
  });
  it.each([{ token: "bad" }, { token: "A".repeat(42) + "B" }, { handle: "../creator" }, { spill_reference: "027" },
    { provider_key: "shopee" }, { source_url: originalUrl }, { input_record: {} }])("rejects invalid/private native authority before RPC %j", async other => {
    const f = fixture(); await denial(await f.http.redeemForm(formRequest({ ...context, token: "A".repeat(43), ...other })));
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([{ handle: "another" }, { spill_reference: 28 }])("burns native cross-context token %j", async other => {
    const f = fixture(); const issued = await (await f.http.issue(request(locator))).json();
    await denial(await f.http.redeemForm(formRequest({ ...context, token: issued.token, ...other }))); expect(f.records.size).toBe(0);
    expect(f.calls.at(-1)!.name).toBe("consume_resource_open_intent_server");
  });
  it.each(["unsafe", "expired", "abort", "provider-error"])("denies native fresh %s without restoration", async state => {
    const f = fixture(); const issued = await (await f.http.issue(request(locator))).json(); const controller = new AbortController();
    if (state === "unsafe") f.unsafe(); else if (state === "expired") f.expire();
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, options) => {
      const response = await normal(input, options);
      if (state === "abort" && String(input).endsWith("consume_resource_open_intent_server")) controller.abort();
      if (state === "provider-error" && String(input).endsWith("resolve_resource_open_intent_source_server"))
        return new Response(JSON.stringify({ message: "private" }), { status: 403 });
      return response;
    });
    await denial(await f.http.redeemForm(formRequest({ ...context, token: issued.token }, controller.signal))); expect(f.records.size).toBe(0);
  });
  it("preserves separate JSON/form media policies and no native issuance", async () => {
    const f = fixture(); await denial(await f.http.issue(formRequest(locator)));
    await denial(await f.http.redeem(formRequest({ ...context, token: "A".repeat(43) })));
    await denial(await f.http.redeemForm(request({ ...context, token: "A".repeat(43) }))); expect(f.fetcher).not.toHaveBeenCalled();
  });
});


describe("private recognition HTTP transport", () => {
  it("returns trusted recognition then redeems via native POST with exact attribution and replay denial", async () => {
    const f = fixture(); const req = request(locator); const response = await f.http.recognize(req);
    expect(response.status).toBe(200); cacheTruth(response); expect(response.headers.get("Location")).toBeNull();
    const payload = await response.json(); expect(payload).toEqual({ recognition: f.recognition, token: expect.any(String) });
    expect(JSON.stringify(payload)).not.toMatch(/publication_token|source_hash|binding|recognition_hash|owner_id/);
    expect(f.permit).toHaveBeenCalledWith(req, "issue"); expect(f.calls).toHaveLength(4);
    const outbound = await f.http.redeemForm(formRequest({ ...context, token: payload.token }));
    expect(outbound.status).toBe(303); cacheTruth(outbound); expect(outbound.headers.get("Location")).toBe(originalUrl);
    await denial(await f.http.redeemForm(formRequest({ ...context, token: payload.token }))); expect(f.records.size).toBe(0);
  });
  it("returns valid degraded recognition with null token before any clock/source/store", async () => {
    const f = fixture(); const degraded = { ...f.recognition, available: false, source_url: null };
    f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ status: "success", recognition: degraded, binding: null })));
    const response = await f.http.recognize(request(locator)); expect(response.status).toBe(200); cacheTruth(response);
    expect(await response.json()).toEqual({ recognition: degraded, token: null }); expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.records.size).toBe(0);
  });
  it.each(["read_resource_open_clock_server", "resolve_published_resource_source_server", "create_resource_open_intent_server"])(
    "returns captured recognition without token after failed %s", async name => {
      const f = fixture(); const normal = f.fetcher.getMockImplementation()!;
      f.fetcher.mockImplementation((input, options) => String(input).endsWith(name)
        ? Promise.resolve(new Response(JSON.stringify({ message: "private failure" }), { status: 403 })) : normal(input, options));
      const response = await f.http.recognize(request(locator)); expect(response.status).toBe(200); cacheTruth(response);
      expect(await response.json()).toEqual({ recognition: f.recognition, token: null }); expect(f.records.size).toBe(0);
    });
  it.each([null, { status: "unavailable" }, { status: "success", recognition: {}, binding: null },
    { status: "success", recognition: {}, binding: null, owner_id: "private" }])("denies invalid/private context uniformly", async data => {
    const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
    await denial(await f.http.recognize(request(locator))); expect(f.fetcher).toHaveBeenCalledTimes(1); expect(f.records.size).toBe(0);
  });
  it.each([null, {}, { ...locator, reference: 27 }, { ...locator, source_url: originalUrl }, { ...locator, operation: "redeem" }])(
    "rejects malformed or injected recognition DTO before RPC", async input => {
      const f = fixture(); await denial(await f.http.recognize(request(input))); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each(["origin", "media", "GET", "abort", "permit"])("denies %s before SDK work", async failure => {
    const f = fixture(); const controller = new AbortController(); let req = request(locator, controller.signal);
    if (failure === "origin") req.headers.set("Origin", "https://attacker.example.test");
    if (failure === "media") req = formRequest(locator);
    if (failure === "GET") req = new Request(`${origin}/staged-action`, { headers: { origin } });
    if (failure === "abort") controller.abort();
    if (failure === "permit") f.permit.mockResolvedValueOnce(false);
    await denial(await f.http.recognize(req)); expect(f.fetcher).not.toHaveBeenCalled();
    if (failure !== "permit") expect(f.permit).not.toHaveBeenCalled();
  });
  it("denies abort after committed creation without returning or restoring authority", async () => {
    const f = fixture(); const controller = new AbortController(); const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, options) => {
      const result = await normal(input, options);
      if (String(input).endsWith("create_resource_open_intent_server")) controller.abort();
      return result;
    });
    await denial(await f.http.recognize(request(locator, controller.signal))); expect(f.records.size).toBe(1);
  });
  it("aggregate deadline denies a late result even after trusted context was captured", async () => {
    vi.useFakeTimers(); const f = fixture(); const normal = f.fetcher.getMockImplementation()!;
    const finishes: Array<() => void> = [];
    f.fetcher.mockImplementation(async (input, options) => {
      const response = await normal(input, options);
      if (["resolve_published_resource_context_server", "read_resource_open_clock_server", "resolve_published_resource_source_server"].some(n => String(input).endsWith(n))) {
        await new Promise<void>(resolve => { finishes.push(resolve); });
      }
      return response;
    });
    const pending = f.http.recognize(request(locator));
    await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(4000); finishes[0]!();
    await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(4000); finishes[1]!();
    await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(2000);
    const response = await pending; await denial(response); expect(f.records.size).toBe(0);
    finishes[2]!(); await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toBe(response); expect(response.headers.get("Location")).toBeNull();
    expect(f.records.size).toBe(1); expect([...f.records.values()][0]).toHaveProperty("expires_at");
    expect(f.fetcher).toHaveBeenCalledTimes(4);
  });
});
