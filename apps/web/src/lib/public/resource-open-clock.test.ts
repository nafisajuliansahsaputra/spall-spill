import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readResourceOpenClock } from "./resource-open-clock";

function fixture(epoch: unknown = 100_000, started = 10, received = 35.5) {
  let counter = started;
  const fetch = vi.fn(async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
    expect(url).toBe("https://clock.example.test/rest/v1/rpc/read_resource_open_clock_server");
    expect(options?.method).toBe("POST");
    counter = received;
    return new Response(JSON.stringify(epoch), { status: 200, headers: { "content-type": "application/json" } });
  });
  const client = createClient("https://clock.example.test", "test-only-publishable-placeholder", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  return { client, fetch, monotonic: () => counter, set: (value: number) => { counter = value; } };
}
afterEach(() => vi.useRealTimers());
describe("staged database clock calibration", () => {
  it("bounds RPC/round-trip and advances conservatively without application wall clock", async () => {
    const f = fixture(); const clock = await readResourceOpenClock(f.client, f.monotonic);
    expect(clock!.lowerNow()).toBe(100_000); expect(clock!.upperNow()).toBe(100_027);
    f.set(37.2); expect(clock!.lowerNow()).toBe(100_001); expect(clock!.upperNow()).toBe(100_029);
    const [url, options] = f.fetch.mock.calls[0]!;
    expect(url).toBe("https://clock.example.test/rest/v1/rpc/read_resource_open_clock_server");
    expect(options!.method).toBe("POST"); expect(new Headers(options!.headers).get("content-profile")).toBe("api");
    expect(options!.signal).toBeInstanceOf(AbortSignal); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([null, "100000", -1, 1.5, {}, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])("denies invalid/overflow epoch %j", async (epoch) => {
    const f = fixture(epoch); expect(await readResourceOpenClock(f.client, f.monotonic)).toBeNull();
  });
  it.each([-1, NaN, Infinity])("denies invalid start counter %j before RPC", async (started) => {
    const f = fixture(100_000, started); expect(await readResourceOpenClock(f.client, f.monotonic)).toBeNull(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each([9, -1, NaN, Infinity, 5010.1])("denies invalid/backward/slow receipt %j", async (received) => {
    const f = fixture(100_000, 10, received); expect(await readResourceOpenClock(f.client, f.monotonic)).toBeNull();
  });
  it("accepts exact maximum round trip with a conservative upper bound", async () => {
    const f = fixture(100_000, 10, 5010); const clock = await readResourceOpenClock(f.client, f.monotonic);
    expect(clock!.lowerNow()).toBe(100_000); expect(clock!.upperNow()).toBe(105_001);
  });
  it.each([35, NaN, Infinity, -1])("permanently invalidates both bounds after counter error %j", async (bad) => {
    const f = fixture(); const clock = await readResourceOpenClock(f.client, f.monotonic);
    f.set(40); expect(clock!.upperNow()).toBe(100_032);
    f.set(bad); expect(clock!.lowerNow()).toBeNaN(); f.set(50); expect(clock!.upperNow()).toBeNaN();
  });
  it("denies elapsed overflow permanently", async () => {
    const f = fixture(); const clock = await readResourceOpenClock(f.client, f.monotonic);
    f.set(Number.MAX_SAFE_INTEGER); expect(clock!.upperNow()).toBeNaN(); f.set(40); expect(clock!.lowerNow()).toBeNaN();
  });
  it("denies SDK permission/network errors without fallback or retry", async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ message: "denied" }), { status: 403 }));
    expect(await readResourceOpenClock(f.client, f.monotonic)).toBeNull();
    f.fetch.mockRejectedValueOnce(new Error("network unavailable"));
    expect(await readResourceOpenClock(f.client, f.monotonic)).toBeNull(); expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it("denies thrown counter reads", async () => {
    const f = fixture(); expect(await readResourceOpenClock(f.client, () => { throw new Error("counter failure"); })).toBeNull();
    expect(f.fetch).not.toHaveBeenCalled();
  });
});

it("denies five-second abort-ignoring transport and ignores a late clock sample", async () => {
  vi.useFakeTimers(); const f = fixture(); let finish!: (value: Response) => void;
  f.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = readResourceOpenClock(f.client, f.monotonic);
  let settled = false; void pending.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(4999); expect(settled).toBe(false);
  const signal = f.fetch.mock.calls[0]![1]!.signal!; expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(await pending).toBeNull(); expect(signal.aborted).toBe(true);
  finish(new Response("100000", { headers: { "content-type": "application/json" } }));
  await vi.advanceTimersByTimeAsync(0); expect(await pending).toBeNull();
  expect(f.fetch).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
it("permanently invalidates callbacks after an elapsed counter exception", async () => {
  const f = fixture(); let broken = false;
  const clock = await readResourceOpenClock(f.client, () => { if (broken) throw new Error("counter"); return f.monotonic(); });
  broken = true; expect(clock!.upperNow()).toBeNaN(); broken = false; expect(clock!.lowerNow()).toBeNaN();
});
