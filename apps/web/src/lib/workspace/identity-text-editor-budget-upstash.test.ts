import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdentityTextEditorDistributedPermit } from "./identity-text-editor-budget";
import { productClickBudgetScript } from "../public/product-click-budget";
import { createIdentityTextEditorUpstashBudgetTransport } from "./identity-text-editor-budget-upstash";
import { readIdentityTextEditorCommandRequest } from "./identity-text-editor-body";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const config = { origin: "https://budget-fixture.upstash.io", namespace: "test", token: "test-only-bearer-placeholder" };
const digest = "a".repeat(64); const keys = [`spall-identity-text-editor:test:{${digest}}:command`, `spall-identity-text-editor:test:{${digest}}:work`];
const args = ["60000", "10", "100", "13"];
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
function fixture() {
  const fetcher = vi.fn<typeof fetch>(async () => response({ result: 1 }));
  const transport = createIdentityTextEditorUpstashBudgetTransport(config, fetcher);
  return { fetcher, transport, eval: () => transport.eval(productClickBudgetScript, keys, args) };
}
describe("bounded private editor Upstash budget transport", () => {
  it.each([
    [keys.map(key => key.replace("spall-identity-text-editor:", "spall-click:")), args],
    [keys.map(key => key.replace("spall-identity-text-editor:", "spall-resource-open:")), args],
    [keys, ["60000", "10", "100", "32"]],
    [keys, ["60000", "10", "100", "31"]],
    [keys, ["60000", "10", "100", "4"]],
    [keys.map(key => key.replace("spall-identity-text-editor:", "spall-identity-link-editor:")), args],
    [keys.map(key => key.replace(":command", ":redeem")), args],
  ])("denies other-domain keys, bundle cost and redemption action", async (selectedKeys, selectedArgs) => {
    const f = fixture();
    expect(await f.transport.eval(productClickBudgetScript, selectedKeys, selectedArgs)).toBeNull();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([0, 11, 13])("denies declared/actual response length mismatch %s", async length => {
    const f = fixture(); f.fetcher.mockResolvedValue(new Response('{"result":1}', {
      headers: { "content-type": "application/json", "content-length": String(length) },
    }));
    expect(await f.eval()).toBeNull();
  });
  it.each([0, 1])("preserves canonical result with exact declared length %s", async result => {
    const f = fixture(); f.fetcher.mockResolvedValue(new Response(JSON.stringify({ result }), {
      headers: { "content-type": "application/json; charset=utf-8", "content-length": "12" },
    }));
    expect(await f.eval()).toBe(result);
  });
  it("denies a nonfinite initial clock before network", async () => {
    vi.spyOn(performance, "now").mockReturnValue(Number.NaN);
    const f = fixture(); expect(await f.eval()).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([99, 1600])("denies backward/late response before its timer callback %s", async elapsed => {
    let now = 100; vi.spyOn(performance, "now").mockImplementation(() => now);
    const f = fixture(); const cancel = vi.fn();
    f.fetcher.mockImplementation(async () => { now = elapsed; return new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json" },
    }); });
    expect(await f.eval()).toBeNull(); expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("cancels a response body arriving after an abort-ignoring fetch timed out", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); const cancel = vi.fn(); let finish!: (r: Response) => void;
      f.fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = f.eval(); await vi.advanceTimersByTimeAsync(1500); expect(await pending).toBeNull();
      finish(new Response(new ReadableStream({ cancel }), { headers: { "content-type": "application/json" } }));
      await vi.advanceTimersByTimeAsync(0); expect(cancel).toHaveBeenCalledTimes(1);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
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
      const f = fixture(); expect(await createIdentityTextEditorUpstashBudgetTransport({ ...config, origin }, f.fetcher).eval(productClickBudgetScript, keys, args)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each(["short", "bearer\r\nInjected:yes", "x".repeat(4097)])("denies invalid credential syntax before network", async token => {
    const f = fixture(); expect(await createIdentityTextEditorUpstashBudgetTransport({ ...config, token }, f.fetcher).eval(productClickBudgetScript, keys, args)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each([["return 1", keys, args], [productClickBudgetScript, keys.map(key => key.replace(":test:", ":other:")), args], [productClickBudgetScript, [keys[0]!, "another:work"], args],
    [productClickBudgetScript, keys, ["060000", "10", "100", "13"]], [productClickBudgetScript, keys, ["60000", "10", "12", "13"]],
    [productClickBudgetScript, keys, ["60000", "10", "100", "3"]]])("confines commands/keys/canonical budget arguments", async (script, selectedKeys, selectedArgs) => {
      const f = fixture(); expect(await f.transport.eval(script as string, selectedKeys as string[], selectedArgs as string[])).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
    });
  it.each([{ result: "1" }, { result: true }, { result: 2 }, { error: "private provider detail" }, { result: 1, extra: "authority" }])
    ("denies noncanonical/error response %j", async body => { const f = fixture(); f.fetcher.mockResolvedValue(response(body)); expect(await f.eval()).toBeNull(); });
  it("composes actual network subject/permit and preserves provider denial", async () => {
    const f = fixture(); const permit = createIdentityTextEditorDistributedPermit({ redis: f.transport,
      key: new Uint8Array(32).fill(7), readTrustedMetadata: async () => ({ address: "192.0.2.1" }),
      policy: { namespace: "test", window_ms: 60000, command_limit: 10, work_limit: 100 } });
    const request = new Request("https://app.example.test/staged"); const signal = new AbortController().signal;
    expect(await permit(request, "identity_text_command", signal)).toBe(true);
    const wire = JSON.parse(String(f.fetcher.mock.calls[0]![1]?.body)) as string[];
    expect(wire[3]).toMatch(/^spall-identity-text-editor:test:\{[a-f0-9]{64}\}:command$/);
    expect(wire.slice(5)).toEqual(["60000", "10", "100", "13"]);
    expect(JSON.stringify(wire)).not.toContain("192.0.2.1");
    f.fetcher.mockResolvedValue(response({ result: 0 })); expect(await permit(request, "identity_text_command", signal)).toBe(false);
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

it("snapshots configuration before invocation", async () => {
  const mutableConfig = { ...config }; const fetcher = vi.fn<typeof fetch>(async () => response({ result: 1 }));
  const transport = createIdentityTextEditorUpstashBudgetTransport(mutableConfig, fetcher);
  mutableConfig.namespace = "other"; mutableConfig.origin = "https://attacker.example.test"; mutableConfig.token = "changed-invalid";
  expect(await transport.eval(productClickBudgetScript, keys, args)).toBe(1);
  expect(fetcher.mock.calls[0]![0]).toBe(`${config.origin}/`);
  expect(new Headers(fetcher.mock.calls[0]![1]?.headers).get("authorization")).toBe(`Bearer ${config.token}`);
});
it.each([null, { ...config, extra: true }, { ...config, namespace: "bad{}" }])("denies strict configuration %j", async bad => {
  const fetcher = vi.fn<typeof fetch>();
  expect(await createIdentityTextEditorUpstashBudgetTransport(bad as typeof config, fetcher).eval(productClickBudgetScript, keys, args)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it("accepts4096 actual bytes and4097 byte-wise reads, copies producer-owned chunks", async () => {
  const text = '{"result":1}' + " ".repeat(4084); const bytes = new TextEncoder().encode(text);
  const shared = new Uint8Array(1); let offset = 0;
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset === bytes.length) { shared[0] = 255; controller.close(); return; }
    shared[0] = bytes[offset++]!; controller.enqueue(shared);
  } }, { highWaterMark: 0 }), { headers: { "content-type": "application/json", "content-length": "4096" } }));
  expect(await createIdentityTextEditorUpstashBudgetTransport(config, fetcher).eval(productClickBudgetScript, keys, args)).toBe(1);
  expect(offset).toBe(4096);
});
it("denies BOM before the literal JSON object", async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new TextEncoder().encode('\ufeff{"result":1}'), { headers: { "content-type": "application/json" } }));
  expect(await createIdentityTextEditorUpstashBudgetTransport(config, fetcher).eval(productClickBudgetScript, keys, args)).toBeNull();
});
it("whole response bound includes fetch time, never waits for ignored cancellation", async () => {
  vi.useFakeTimers(); try {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const fetcher = vi.fn<typeof fetch>(() => new Promise(resolve => setTimeout(() => resolve(new Response(new ReadableStream({ cancel }), {
      headers: { "content-type": "application/json" },
    })), 1000)));
    const pending = createIdentityTextEditorUpstashBudgetTransport(config, fetcher).eval(productClickBudgetScript, keys, args);
    await vi.advanceTimersByTimeAsync(1500); expect(await pending).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0]![1]?.signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it.each([
  ["999", "10", "100", "13"], ["3600001", "10", "100", "13"], ["60000", "0", "100", "13"],
  ["60000", "1000001", "100", "13"], ["60000", "10", "12", "13"], ["60000", "10", "1000001", "13"],
  [60000, "10", "100", "13"], [["60000"], "10", "100", "13"], ["60000", "10", "100", 13],
  ["60000", "10", "100", "13", "extra"],
])("denies out-of-range or non-string budget arguments %j before network", async (...selectedArgs) => {
  const f = fixture(); expect(await f.transport.eval(productClickBudgetScript, keys, selectedArgs as string[])).toBeNull();
  expect(f.fetcher).not.toHaveBeenCalled();
});
it.each([
  [keys[0]!.replace(digest, "A".repeat(64)), keys[1]!], [keys[0]!, keys[1]!.replace(digest, "b".repeat(64))],
  [keys[0]!], [...keys, "extra"],
])("denies noncanonical/mismatched key tuple %j before network", async (...selectedKeys) => {
  const f = fixture(); expect(await f.transport.eval(productClickBudgetScript, selectedKeys, args)).toBeNull(); expect(f.fetcher).not.toHaveBeenCalled();
});


it.each([[0, 1], [1, 0], [1, null]] as const)("owns Buffer response bytes before producer mutation %s → %s", async (original, changed) => {
  const producer = Buffer.from(JSON.stringify({ result: original })); let pulls = 0;
  const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (pulls++ === 0) { controller.enqueue(producer); return; }
    if (changed === null) producer.fill(255);
    else producer.set(Buffer.from(JSON.stringify({ result: changed })));
    controller.close();
  } }, { highWaterMark: 0 }), { headers: { "content-type": "application/json", "content-length": String(producer.length) } }));
  expect(await createIdentityTextEditorUpstashBudgetTransport(config, fetcher).eval(productClickBudgetScript, keys, args)).toBe(original);
  expect(pulls).toBe(2);
});


it("allows minimum13 work capacity with the fixed13-unit command", async () => {
  const f = fixture(); expect(await f.transport.eval(productClickBudgetScript, keys, ["1000", "1", "13", "13"])).toBe(1);
  expect(JSON.parse(String(f.fetcher.mock.calls[0]![1]?.body)).slice(5)).toEqual(["1000", "1", "13", "13"]);
});
it("composes actual Text body, trusted subject, permit and controlled transport on grant/denial", async () => {
  const f = fixture(), readTrustedMetadata = vi.fn(async () => ({ address: "192.0.2.1" }));
  const permit = createIdentityTextEditorDistributedPermit({ redis: f.transport, key: new Uint8Array(32).fill(7), readTrustedMetadata,
    policy: { namespace: "test", window_ms: 60000, command_limit: 10, work_limit: 13 } });
  const origin = "https://app.example.test", command = { action: "initialize_text_block", base_collection_revision: null,
    is_visible: true, text_working: { kind: "text", text: null } };
  const request = () => new Request(`${origin}/staged`, { method: "POST", body: JSON.stringify(command),
    headers: { origin, host: "app.example.test", "content-type": "application/json" } });
  const allowed = request(); expect(await readIdentityTextEditorCommandRequest(allowed, origin, (action, signal) => permit(allowed, action, signal))).toEqual(command);
  expect(allowed.bodyUsed).toBe(true);
  f.fetcher.mockResolvedValue(response({ result: 0 })); const denied = request();
  expect(await readIdentityTextEditorCommandRequest(denied, origin, (action, signal) => permit(denied, action, signal))).toBeNull();
  expect(denied.bodyUsed).toBe(false); expect(readTrustedMetadata).toHaveBeenCalledTimes(2); expect(f.fetcher).toHaveBeenCalledTimes(2);
  for (const [, init] of f.fetcher.mock.calls) {
    const wire = JSON.parse(String(init?.body)); expect(wire.slice(5)).toEqual(["60000", "10", "13", "13"]);
    expect(JSON.stringify(wire)).not.toContain("192.0.2.1");
  }
});
