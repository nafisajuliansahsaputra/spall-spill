import { describe, expect, it, vi } from "vitest";
import { createProductClickDistributedPermit, productClickBudgetScript } from "./product-click-budget";
import { createProductClickUpstashBudgetTransport } from "./product-click-budget-upstash";
const config = { origin: "https://budget-fixture.upstash.io", namespace: "test", token: "test-only-bearer-placeholder" };
const digest = "a".repeat(64); const keys = [`spall-click:test:{${digest}}:issue`, `spall-click:test:{${digest}}:work`];
const args = ["60000", "10", "100", "32"];
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
function fixture() {
  const fetcher = vi.fn<typeof fetch>(async () => response({ result: 1 }));
  const transport = createProductClickUpstashBudgetTransport(config, fetcher);
  return { fetcher, transport, eval: () => transport.eval(productClickBudgetScript, keys, args) };
}
describe("bounded private Upstash budget transport", () => {
  it("uses the read-back EVAL protocol without exposing token in command data", async () => {
    const f = fixture(); expect(await f.eval()).toBe(1); expect(f.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = f.fetcher.mock.calls[0]!;
    expect(url).toBe(`${config.origin}/`); expect(init?.method).toBe("POST"); expect(init?.redirect).toBe("error"); expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${config.token}`);
    expect(JSON.parse(String(init?.body))).toEqual(["eval", productClickBudgetScript, 2, ...keys, ...args]);
    expect(String(init?.body)).not.toContain(config.token);
  });
  it.each(["http://budget-fixture.upstash.io", "https://attacker.example.test", "https://budget-fixture.upstash.io/",
    "https://budget-fixture.upstash.io:444", "https://user@budget-fixture.upstash.io", "https://budget-fixture.upstash.io?q=1",
    "https://sub.budget-fixture.upstash.io"])("denies noncanonical service origin %s", async origin => {
      const f = fixture(); expect(await createProductClickUpstashBudgetTransport({ ...config, origin }, f.fetcher).eval(productClickBudgetScript, keys, args)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each(["short", "bearer\r\nInjected:yes", "x".repeat(4097)])("denies invalid credential syntax before network", async token => {
    const f = fixture(); expect(await createProductClickUpstashBudgetTransport({ ...config, token }, f.fetcher).eval(productClickBudgetScript, keys, args)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([["return 1", keys, args], [productClickBudgetScript, keys.map(key => key.replace(":test:", ":other:")), args], [productClickBudgetScript, [keys[0]!, "another:work"], args],
    [productClickBudgetScript, keys, ["060000", "10", "100", "32"]], [productClickBudgetScript, keys, ["60000", "10", "31", "32"]],
    [productClickBudgetScript, keys, ["60000", "10", "100", "3"]]])("confines commands/keys/canonical budget arguments", async (script, selectedKeys, selectedArgs) => {
      const f = fixture(); expect(await f.transport.eval(script as string, selectedKeys as string[], selectedArgs as string[])).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each([{ result: "1" }, { result: true }, { result: 2 }, { error: "private provider detail" }, { result: 1, extra: "authority" }])
    ("denies noncanonical/error response %j", async body => { const f = fixture(); f.fetcher.mockResolvedValue(response(body)); expect(await f.eval()).toBeNull(); });
  it("preserves a valid distributed denial and integrates the trusted subject permit", async () => {
    const f = fixture(); const permit = createProductClickDistributedPermit({ operation: "bundle", redis: f.transport,
      identity: async () => "trusted-opaque-subject", policy: { namespace: "test", window_ms: 60000, issue_limit: 10, redeem_limit: 20, work_limit: 100 } });
    const request = new Request("https://app.example.test/staged"); expect(await permit(request, "issue")).toBe(true);
    f.fetcher.mockResolvedValue(response({ result: 0 })); expect(await permit(request, "issue")).toBe(false);
  });
  it.each([302, 403, 429, 500])("denies provider HTTP status without retry %s", async status => {
    const f = fixture(); f.fetcher.mockResolvedValue(new Response('{"result":1}', { status, headers: { "content-type": "application/json" } }));
    expect(await f.eval()).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([new Uint8Array([0xff]), new TextEncoder().encode('{"result":'), new TextEncoder().encode("x".repeat(4097))])
    ("denies invalid UTF-8, truncated or oversized bytes", async bytes => {
      const f = fixture(); f.fetcher.mockResolvedValue(new Response(bytes, { headers: { "content-type": "application/json" } })); expect(await f.eval()).toBeNull();
    });
  it.each([{ "content-type": "text/html" }, { "content-type": "application/json", "content-length": "4097" },
    { "content-type": "application/json", "content-length": "0012" }])("denies invalid response framing before reading", async headers => {
    const f = fixture(); const cancel = vi.fn();
    f.fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers }));
    expect(await f.eval()).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each(['{"result":0,"result":1}', '{"res\\u0075lt":1}'])("denies duplicate or nonliteral response keys", async text => {
    const f = fixture(); f.fetcher.mockResolvedValue(new Response(text, { headers: { "content-type": "application/json" } })); expect(await f.eval()).toBeNull();
  });
  it.each([{ redirected: true }, { url: "https://attacker.example.test/" }])("denies redirect or mismatched final URL", async values => {
    const f = fixture(); const r = response({ result: 1 }); for (const [key, value] of Object.entries(values)) Object.defineProperty(r, key, { value });
    f.fetcher.mockResolvedValue(r); expect(await f.eval()).toBeNull();
  });
  it("denies network failure without exposing provider error or retrying", async () => {
    const f = fixture(); f.fetcher.mockRejectedValue(new Error("private provider detail")); expect(await f.eval()).toBeNull(); expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it("cancels a hung body when the whole response deadline expires", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); const cancel = vi.fn(); f.fetcher.mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }));
      const pending = f.eval(); await vi.advanceTimersByTimeAsync(1500); expect(await pending).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("bounds timeout and aborts late fetch without retry", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); let finish!: (r: Response) => void;
      f.fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = f.eval(); await vi.advanceTimersByTimeAsync(1500); expect(await pending).toBeNull();
      expect(f.fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      finish(response({ result: 1 })); await vi.advanceTimersByTimeAsync(0); expect(f.fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it("bounds empty stream framing and cancels abandoned reads", async () => {
    const f = fixture(); const cancel = vi.fn(); let reads = 0;
    f.fetcher.mockResolvedValue(new Response(new ReadableStream({ pull(controller) { reads++; controller.enqueue(new Uint8Array()); }, cancel }), { headers: { "content-type": "application/json" } }));
    expect(await f.eval()).toBeNull(); expect(reads).toBeLessThanOrEqual(4098); expect(cancel).toHaveBeenCalledTimes(1);
  });
});
