import { describe, expect, it, vi } from "vitest";
import { createProductClickDistributedPermit, productClickBudgetScript } from "./product-click-budget";
const policy = { namespace: "test", window_ms: 60000, issue_limit: 10, redeem_limit: 20, work_limit: 100 };
const subject = "trusted-subject-identifier";
const request = () => new Request("https://app.example.test/staged", { method: "POST", headers: { "x-forwarded-for": "attacker" } });
function fixture(operation: "issue" | "bundle" | "redeem" = "bundle") {
  const evalCall = vi.fn(async () => 1 as unknown); const identity = vi.fn(async () => subject as unknown);
  const permit = createProductClickDistributedPermit({ operation, policy, redis: { eval: evalCall }, identity });
  return { permit, identity, evalCall };
}
describe("private distributed Product click permit", () => {
  it.each(["issue", "bundle", "redeem"] as const)("selects trusted operation cost and matching action %s", async operation => {
    const f = fixture(operation); expect(await f.permit(request(), operation === "redeem" ? "redeem" : "issue")).toBe(true);
    const [script, keys, args] = f.evalCall.mock.calls[0]! as unknown as [string, string[], string[]];
    expect(script).toBe(productClickBudgetScript); expect(args).toEqual(["60000", operation === "redeem" ? "20" : "10", "100", String({ issue: 4, bundle: 32, redeem: 3 }[operation])]);
    expect(keys).toHaveLength(2); expect(keys[0]!.match(/\{[^}]+\}/)?.[0]).toBe(keys[1]!.match(/\{[^}]+\}/)?.[0]);
    expect(keys.join()).not.toContain(subject); expect(keys.join()).not.toContain("attacker"); expect(f.identity).toHaveBeenCalledTimes(1);
  });
  it.each([0, "1", true, null, [1], { result: 1 }])("requires literal numeric Redis grant %j", async result => {
    const f = fixture(); f.evalCall.mockResolvedValue(result); expect(await f.permit(request(), "issue")).toBe(false);
  });
  it.each([null, "short", "raw ip:127.0.0.1", { subject }, "x".repeat(129)])("denies invalid trusted identity %j", async value => {
    const f = fixture(); f.identity.mockResolvedValue(value); expect(await f.permit(request(), "issue")).toBe(false); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it("denies wrong server-selected action before identity or Redis", async () => {
    const f = fixture(); expect(await f.permit(request(), "redeem")).toBe(false); expect(f.identity).not.toHaveBeenCalled(); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it.each([{ ...policy, namespace: "bad{}" }, { ...policy, window_ms: 0 }, { ...policy, work_limit: 31 },
    { ...policy, issue_limit: 1.5 }, { ...policy, redeem_limit: 1000001 }, { ...policy, extra: "ignored" }])
    ("denies invalid/insufficient deployment policy %j", async bad => {
      const identity = vi.fn(async () => subject); const evalCall = vi.fn(async () => 1);
      const permit = createProductClickDistributedPermit({ operation: "bundle", policy: bad, identity, redis: { eval: evalCall } });
      expect(await permit(request(), "issue")).toBe(false); expect(identity).not.toHaveBeenCalled(); expect(evalCall).not.toHaveBeenCalled();
    });
  it("does not retry errors or expose provider details", async () => {
    const f = fixture(); f.evalCall.mockRejectedValue(new Error("private provider detail"));
    expect(await f.permit(request(), "issue")).toBe(false); expect(f.evalCall).toHaveBeenCalledTimes(1);
  });
  it("denies request abortion during a durable budget grant", async () => {
    const f = fixture(); const controller = new AbortController(); f.evalCall.mockImplementation(async () => { controller.abort(); return 1; });
    const req = new Request("https://app.example.test/staged", { signal: controller.signal });
    expect(await f.permit(req, "issue")).toBe(false);
  });
  it("denies a nonfinite monotonic clock without trusting wall time", async () => {
    vi.spyOn(performance, "now").mockReturnValue(Number.NaN);
    const f = fixture(); expect(await f.permit(request(), "issue")).toBe(false); expect(f.identity).not.toHaveBeenCalled();
  });
  it("does not start Redis when late identity resolves before its delayed timer callback", async () => {
    let now = 100; vi.spyOn(performance, "now").mockImplementation(() => now);
    const f = fixture(); f.identity.mockImplementation(async () => { now = 2100; return subject; });
    expect(await f.permit(request(), "issue")).toBe(false); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it("does not start Redis after a late identity timeout", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); let finish!: (s: string) => void; f.identity.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = f.permit(request(), "issue"); await vi.advanceTimersByTimeAsync(2000); expect(await pending).toBe(false);
      finish(subject); await vi.advanceTimersByTimeAsync(0); expect(f.evalCall).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("does not return or restore a late durable grant", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); let finish!: (n: number) => void; f.evalCall.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = f.permit(request(), "issue"); await vi.advanceTimersByTimeAsync(2000); expect(await pending).toBe(false);
      finish(1); await vi.advanceTimersByTimeAsync(0); expect(f.evalCall).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
