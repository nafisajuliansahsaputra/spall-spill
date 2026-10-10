import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublishedResourceOpenIssuance } from "./resource-open-issuance";

const url = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const binding = { handle: "creator", spill_reference: 27, publication_token: "a".repeat(64),
  source_hash: createHash("sha256").update(url).digest("hex") };
const recognition = { status: "success", current_handle: "creator", display_name: "Published Owner", spill_reference: 27,
  resource_type: "portfolio", title: "Published Portfolio", available: true, source_url: url };
const locator = { handle: "previous", reference: "#27" };
const context = { handle: "creator", spill_reference: 27 };
function fixture() {
  let lower = 100_000; let upper = 100_001;
  const records = new Map<string, unknown>();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const readClock = vi.fn(async () => ({ lowerNow: () => lower, upperNow: () => upper }));
  const fetcher = vi.fn<typeof fetch>(async (input, options) => {
    const name = String(input).split("/").at(-1)!; const args = JSON.parse(options!.body as string);
    expect(new Headers(options!.headers).get("content-profile")).toBe("api"); expect(options!.method).toBe("POST");
    calls.push({ name, args }); let data: unknown = null;
    if (name === "resolve_published_resource_context_server") data = { status: "success", recognition, binding };
    if (name === "resolve_published_resource_source_server" || name === "resolve_resource_open_intent_source_server") data = { status: "success", source_url: url };
    if (name === "create_resource_open_intent_server") { records.set(args.input_token_hash, args.input_record); data = true; }
    if (name === "consume_resource_open_intent_server") { data = records.get(args.input_token_hash) ?? null; records.delete(args.input_token_hash); }
    if (name === "cleanup_resource_open_intents_server") data = 0;
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://assembly.example.test", "test-only-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher },
  });
  return { assembly: createPublishedResourceOpenIssuance(client, readClock), fetcher, readClock, records, calls,
    setTime: (l: number, u: number) => { lower = l; upper = u; } };
}
afterEach(() => vi.useRealTimers());
describe("staged calibrated Resource Open assembly", () => {
  it("issues only public recognition/token and redeems once via stored-record deadline resolution", async () => {
    const f = fixture(); const issued = await f.assembly.issue(locator);
    expect(issued).toEqual({ recognition, token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    const stored = [...f.records.values()][0];
    expect(stored).toMatchObject({ issued_at: 100_000, expires_at: 220_000, binding });
    expect(await f.assembly.redeem(issued!.token, context)).toBe(url);
    expect(f.calls.at(-1)).toEqual({ name: "resolve_resource_open_intent_source_server", args: { input_record: stored } });
    expect(f.calls.map(c => c.name)).toEqual(["resolve_published_resource_context_server", "resolve_published_resource_source_server",
      "create_resource_open_intent_server", "consume_resource_open_intent_server", "resolve_resource_open_intent_source_server"]);
    expect(await f.assembly.redeem(issued!.token, context)).toBeNull(); expect(f.readClock).toHaveBeenCalledTimes(3);
    expect(f.records.size).toBe(0);
  });
  it.each([null, {}, { ...locator, reference: 27 }, { ...locator, source_url: url }])("rejects invalid locator before calibration/store", async input => {
    const f = fixture(); expect(await f.assembly.issue(input)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled(); expect(f.readClock).not.toHaveBeenCalled();
  });
  it.each([null, { status: "unavailable" }, { status: "success", recognition, binding: null },
    { status: "success", recognition, binding, owner_id: "private" }])("requires trusted valid same-Published context", async data => {
    const f = fixture(); f.fetcher.mockResolvedValueOnce(new Response(JSON.stringify(data)));
    expect(await f.assembly.issue(locator)).toBeNull(); expect(f.readClock).not.toHaveBeenCalled(); expect(f.records.size).toBe(0);
  });
  it("denies failed calibration before create or consume without wall-clock fallback", async () => {
    const f = fixture(); const issued = await f.assembly.issue(locator);
    f.readClock.mockResolvedValue(null as never);
    expect(await f.assembly.issue(locator)).toBeNull(); expect(await f.assembly.redeem(issued!.token, context)).toBeNull();
    expect(f.records.size).toBe(1); expect(f.calls.at(-1)!.name).toBe("resolve_published_resource_context_server");
  });
  it("denies expired upper issuance bound despite valid lower timestamp", async () => {
    const f = fixture(); f.setTime(100_000, 220_000); expect(await f.assembly.issue(locator)).toBeNull();
    expect(f.records.size).toBe(1); expect([...f.records.values()][0]).toMatchObject({ issued_at: 100_000, expires_at: 220_000 });
  });
  it.each([{ ...context, handle: "other" }, { ...context, spill_reference: 28 }])("burns context mismatch before deadline RPC", async expected => {
    const f = fixture(); const issued = await f.assembly.issue(locator);
    expect(await f.assembly.redeem(issued!.token, expected)).toBeNull(); expect(f.records.size).toBe(0);
    expect(f.calls.at(-1)!.name).toBe("consume_resource_open_intent_server");
  });
  it("denies async expiry after deadline source response and never restores", async () => {
    const f = fixture(); const issued = await f.assembly.issue(locator);
    const normal = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (input, options) => {
      const result = await normal(input, options);
      if (String(input).endsWith("resolve_resource_open_intent_source_server")) f.setTime(100_000, 220_000);
      return result;
    });
    expect(await f.assembly.redeem(issued!.token, context)).toBeNull(); expect(f.records.size).toBe(0);
  });
  it("bounds deadline transport that ignores abort and denies late resolution", async () => {
    vi.useFakeTimers(); const f = fixture(); const issued = await f.assembly.issue(locator);
    const normal = f.fetcher.getMockImplementation()!; let finish!: (value: Response) => void;
    f.fetcher.mockImplementation((input, options) => String(input).endsWith("resolve_resource_open_intent_source_server")
      ? new Promise(resolve => { finish = resolve; }) : normal(input, options));
    const pending = f.assembly.redeem(issued!.token, context);
    await vi.advanceTimersByTimeAsync(5000); expect(await pending).toBeNull(); expect(f.records.size).toBe(0);
    finish(new Response(JSON.stringify({ status: "success", source_url: url }))); await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(5);
  });
  it("cleanup does not require calibration", async () => {
    const f = fixture(); expect(await f.assembly.cleanup(10)).toBe(0); expect(f.readClock).not.toHaveBeenCalled();
    expect(f.calls).toEqual([{ name: "cleanup_resource_open_intents_server", args: { input_limit: 10 } }]);
  });
});

it.each([null, { status: "unavailable" }, { status: "success", source_url: "https://foreign.example.test/" }])("burns consumption after rejected exact deadline source", async data => {
  const f = fixture(); const issued = await f.assembly.issue(locator); const normal = f.fetcher.getMockImplementation()!;
  f.fetcher.mockImplementation((input, options) => String(input).endsWith("resolve_resource_open_intent_source_server")
    ? Promise.resolve(new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } })) : normal(input, options));
  expect(await f.assembly.redeem(issued!.token, context)).toBeNull(); expect(f.records.size).toBe(0);
  expect(await f.assembly.redeem(issued!.token, context)).toBeNull();
});
it("never consumes malformed capability or browser-supplied private record", async () => {
  const f = fixture(); expect(await f.assembly.redeem("invalid", context)).toBeNull();
  expect(await f.assembly.redeem("a".repeat(43), { ...context, binding })).toBeNull();
  expect(f.fetcher).not.toHaveBeenCalled();
});
