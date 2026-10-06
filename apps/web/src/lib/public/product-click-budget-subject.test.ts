import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createProductClickNetworkSubject } from "./product-click-budget-subject";
import { createProductClickDistributedPermit } from "./product-click-budget";

const key = new Uint8Array(32).fill(7); // Test-only fixture, never a deployment secret.
const request = () => new Request("https://app.example.test/staged", { headers: {
  forwarded: "for=203.0.113.9", "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" } });
function fixture(metadata: unknown = { address: "192.0.2.1" }, options = {}) {
  const readTrustedMetadata = vi.fn(async () => metadata);
  const identity = createProductClickNetworkSubject({ namespace: "test", key, readTrustedMetadata, ...options });
  return { identity, readTrustedMetadata };
}
describe("private trusted network Product budget subjects", () => {
  it("returns only a domain-separated keyed digest, reading trusted metadata freshly", async () => {
    const f = fixture();
    const exact = createHmac("sha256", key).update(["spall-click-network-subject-v1", "test", "4:192.0.2.1"].join("\0")).digest("base64url");
    expect(await f.identity(request())).toBe(exact);
    expect(await f.identity(request())).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(f.readTrustedMetadata).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["2001:DB8:0:0:0:0:0:1", "2001:db8::1"],
    ["::ffff:192.0.2.1", "192.0.2.1"], ["0:0:0:0:0:ffff:c000:201", "192.0.2.1"],
    ["0:0:0:0:0:0:0:0", "::"], ["2001:db8::192.0.2.1", "2001:db8::c000:201"]
  ])("shares subjects for equivalent literals %s / %s", async (a, b) => {
    const subject = await fixture({ address: a }).identity(request());
    expect(subject).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(subject).toBe(await fixture({ address: b }).identity(request()));
  });
  it("retains every IPv6 bit, including uncompressed and terminal-zero addresses", async () => {
    const full = "2001:db8:abcd:1234:5678:9abc:def0:1234";
    const expected = createHmac("sha256", key).update(["spall-click-network-subject-v1", "test", "6:20010db8abcd123456789abcdef01234"].join("\0")).digest("base64url");
    expect(await fixture({ address: full }).identity(request())).toBe(expected);
    const terminal = await fixture({ address: "2001:db8::" }).identity(request());
    expect(terminal).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(terminal).not.toBe(await fixture({ address: "2001:db8::1" }).identity(request()));
  });
  it.each(["192.0.2.2", "2001:db8::1", "::192.0.2.1"])("keeps different or non-mapped address %s distinct", async address => {
    expect(await fixture({ address }).identity(request())).not.toBe(await fixture().identity(request()));
  });
  it("isolates namespaces and server keys and snapshots key bytes", async () => {
    const original = await fixture().identity(request());
    expect(await fixture(undefined, { namespace: "other" }).identity(request())).not.toBe(original);
    expect(await fixture(undefined, { key: new Uint8Array(32).fill(8) }).identity(request())).not.toBe(original);
    const mutable = new Uint8Array(key); const f = fixture(undefined, { key: mutable }); mutable.fill(9);
    expect(await f.identity(request())).toBe(original);
  });
  it.each([null, "192.0.2.1", {}, { address: "192.0.2.1", extra: true }, { address: 42 }])("denies invalid trusted metadata %j", async metadata => {
    expect(await fixture(metadata).identity(request())).toBeNull();
  });
  it.each([" 192.0.2.1", "192.0.2.1\n", "192.000.2.1", "127.1", "2130706433", "0xc0000201", "0300.0.2.1",
    "192.0.2.1:443", "[2001:db8::1]", "fe80::1%eth0", "192.0.2.1,192.0.2.2", "example.test", "unknown", "", "x".repeat(46)])
    ("denies ambiguous or invalid address %j", async address => { expect(await fixture({ address }).identity(request())).toBeNull(); });
  it.each([{ namespace: "bad{}" }, { namespace: "x".repeat(49) }, { key: new Uint8Array(31) },
    { key: new Uint8Array(65) }, { key: null }, { namespace: undefined }, { readTrustedMetadata: undefined }])
    ("fails closed for missing or invalid dependencies %j", async options => {
      const f = fixture(undefined, options); expect(await f.identity(request())).toBeNull();
    });
  it("does not use spoofed request headers as fallback", async () => {
    const f = fixture(null); expect(await f.identity(request())).toBeNull();
    expect(f.readTrustedMetadata).toHaveBeenCalledWith(expect.any(Request));
  });
  it("denies reader error without retry", async () => {
    const f = fixture(); f.readTrustedMetadata.mockRejectedValue(new Error("private metadata"));
    expect(await f.identity(request())).toBeNull(); expect(f.readTrustedMetadata).toHaveBeenCalledTimes(1);
  });
  it("denies abortion before and during trusted read", async () => {
    const controller = new AbortController(); const req = new Request("https://app.example.test/staged", { signal: controller.signal });
    const f = fixture(); f.readTrustedMetadata.mockImplementation(async () => { controller.abort(); return { address: "192.0.2.1" }; });
    expect(await f.identity(req)).toBeNull(); expect(await f.identity(req)).toBeNull(); expect(f.readTrustedMetadata).toHaveBeenCalledTimes(1);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY])("denies nonfinite monotonic start %s", async now => {
    vi.spyOn(performance, "now").mockReturnValue(now); const f = fixture();
    expect(await f.identity(request())).toBeNull(); expect(f.readTrustedMetadata).not.toHaveBeenCalled();
  });
  it.each([99, 600, Number.NaN])("denies backward/late/nonfinite completion %s", async now => {
    let clock = 100; vi.spyOn(performance, "now").mockImplementation(() => clock); const f = fixture();
    f.readTrustedMetadata.mockImplementation(async () => { clock = now; return { address: "192.0.2.1" }; });
    expect(await f.identity(request())).toBeNull();
  });
  it("bounds hanging readers and cannot revive a late subject", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); let finish!: (m: unknown) => void;
      f.readTrustedMetadata.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = f.identity(request()); await vi.advanceTimersByTimeAsync(500); expect(await pending).toBeNull();
      finish({ address: "192.0.2.1" }); await vi.advanceTimersByTimeAsync(0); expect(await pending).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("composes shared canonical identity budgets and denies absent identity before Redis", async () => {
    const f = fixture(); const evalCall = vi.fn(async () => 1);
    const permit = createProductClickDistributedPermit({ operation: "bundle", identity: f.identity, redis: { eval: evalCall },
      policy: { namespace: "test", window_ms: 60000, issue_limit: 10, redeem_limit: 10, work_limit: 100 } });
    expect(await permit(request(), "issue")).toBe(true);
    f.readTrustedMetadata.mockResolvedValue({ address: "::ffff:192.0.2.1" }); expect(await permit(request(), "issue")).toBe(true);
    const calls = evalCall.mock.calls as unknown as [string, string[], string[]][];
    expect(calls[0]![1]).toEqual(calls[1]![1]); expect(JSON.stringify(calls)).not.toContain("192.0.2.1");
    f.readTrustedMetadata.mockResolvedValue(null); expect(await permit(request(), "issue")).toBe(false); expect(evalCall).toHaveBeenCalledTimes(2);
  });
});
