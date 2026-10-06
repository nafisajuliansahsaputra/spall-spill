import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { readProductClickClock } from "./product-click-clock";

function fixture(epoch: unknown = 100_000, started = 10, received = 35.5) {
  let counter = started;
  const fetch = vi.fn(async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    expect(url).toBe("https://clock.example.test/rest/v1/rpc/read_product_click_clock_server");
    expect(options?.method).toBe("POST");
    counter = received;
    return new Response(JSON.stringify(epoch), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://clock.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  return { client, fetch, monotonic: () => counter, set: (value: number) => { counter = value; } };
}
describe("staged database clock calibration", () => {
  it("bounds RPC/round-trip and advances conservatively without application wall clock", async () => {
    const f = fixture(); const clock = await readProductClickClock(f.client, f.monotonic);
    expect(clock!.lowerNow()).toBe(100_000); expect(clock!.upperNow()).toBe(100_027);
    f.set(37.2); expect(clock!.lowerNow()).toBe(100_001); expect(clock!.upperNow()).toBe(100_029);
    const [url, options] = f.fetch.mock.calls[0]!;
    expect(url).toBe("https://clock.example.test/rest/v1/rpc/read_product_click_clock_server");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeInstanceOf(AbortSignal); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, "100000", -1, 1.5, {}, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])("denies invalid/overflow epoch %j", async (epoch) => {
    const f = fixture(epoch); expect(await readProductClickClock(f.client, f.monotonic)).toBeNull();
  });
  it.each([-1, NaN, Infinity])("denies invalid start counter %j before RPC", async (started) => {
    const f = fixture(100_000, started); expect(await readProductClickClock(f.client, f.monotonic)).toBeNull(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([9, -1, NaN, Infinity, 5010.1])("denies invalid/backward/slow receipt %j", async (received) => {
    const f = fixture(100_000, 10, received); expect(await readProductClickClock(f.client, f.monotonic)).toBeNull();
  });
  it("accepts exact maximum round trip with a conservative upper bound", async () => {
    const f = fixture(100_000, 10, 5010); const clock = await readProductClickClock(f.client, f.monotonic);
    expect(clock!.lowerNow()).toBe(100_000); expect(clock!.upperNow()).toBe(105_001);
  });
  it.each([35, NaN, Infinity, -1])("permanently invalidates both bounds after counter error %j", async (bad) => {
    const f = fixture(); const clock = await readProductClickClock(f.client, f.monotonic);
    f.set(40); expect(clock!.upperNow()).toBe(100_032);
    f.set(bad); expect(clock!.lowerNow()).toBeNaN(); f.set(50); expect(clock!.upperNow()).toBeNaN();
  });
  it("denies elapsed overflow permanently", async () => {
    const f = fixture(); const clock = await readProductClickClock(f.client, f.monotonic);
    f.set(Number.MAX_SAFE_INTEGER); expect(clock!.upperNow()).toBeNaN(); f.set(40); expect(clock!.lowerNow()).toBeNaN();
  });
  it("denies SDK permission/network errors without fallback or retry", async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: "denied" }), { status: 403 }));
    expect(await readProductClickClock(f.client, f.monotonic)).toBeNull();
    f.fetch.mockRejectedValueOnce(new Error("network unavailable"));
    expect(await readProductClickClock(f.client, f.monotonic)).toBeNull(); expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it("denies thrown counter reads", async () => {
    const f = fixture(); expect(await readProductClickClock(f.client, () => { throw new Error("counter failure"); })).toBeNull();
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
