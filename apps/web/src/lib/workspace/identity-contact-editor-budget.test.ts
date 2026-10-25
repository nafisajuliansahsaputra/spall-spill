import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdentityContactEditorDistributedPermit } from "./identity-contact-editor-budget";
import { createIdentityTextEditorNetworkSubject } from "./identity-text-editor-budget-subject";
import { createIdentityLinkEditorNetworkSubject } from "./identity-link-editor-budget-subject";
import { productClickBudgetScript } from "../public/product-click-budget";
import { readIdentityContactEditorCommandRequest } from "./identity-contact-editor-body";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const policy = { namespace: "test", window_ms: 60000, command_limit: 10, work_limit: 130 };
const key = new Uint8Array(32).fill(7); // Isolated fixture only.
const origin = "https://app.example.test";
const command = { action: "initialize_contact_block", base_collection_revision: null, is_visible: true,
  contact_working: { kind: "contact", contact_type: null, label: null, value: null } };
const request = (signal?: AbortSignal) => new Request(`${origin}/staged`, { method: "POST", body: JSON.stringify(command),
  headers: { origin, host: "app.example.test", "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
  ...(signal ? { signal } : {}) });
function fixture(options = {}) {
  const readTrustedMetadata = vi.fn(async (): Promise<unknown> => ({ address: "192.0.2.1" }));
  const evalCall = vi.fn<(script: string, keys: readonly string[], args: readonly string[]) => Promise<unknown>>(async () => 1);
  const permit = createIdentityContactEditorDistributedPermit({ policy, key, readTrustedMetadata, redis: { eval: evalCall }, ...options });
  const run = (req = request(), signal = new AbortController().signal) => permit(req, "identity_contact_command", signal);
  return { permit, run, readTrustedMetadata, evalCall };
}
describe("private editor distributed network admission", () => {
  it("charges one fixed13-RPC budget without touching body or headers", async () => {
    const f = fixture(), req = request(); const reader = vi.spyOn(req.body!, "getReader");
    expect(await f.run(req)).toBe(true); expect(reader).not.toHaveBeenCalled(); expect(req.bodyUsed).toBe(false);
    const subject = createHmac("sha256", key).update(["spall-identity-contact-editor-network-subject-v1", "test", "4:192.0.2.1"].join("\0")).digest("base64url");
    const digest = createHash("sha256").update(`test\0${subject}`).digest("hex");
    expect(f.evalCall).toHaveBeenCalledExactlyOnceWith(productClickBudgetScript,
      [`spall-identity-contact-editor:test:{${digest}}:command`, `spall-identity-contact-editor:test:{${digest}}:work`], ["60000", "10", "130", "13"]);
    expect(f.readTrustedMetadata).toHaveBeenCalledExactlyOnceWith(req);
    expect(JSON.stringify(f.evalCall.mock.calls)).not.toContain("192.0.2.1");
  });
  it("composes the real bounded body reader without a permissive fixture permit", async () => {
    const f = fixture(); const req = request();
    expect(await readIdentityContactEditorCommandRequest(req, origin, (action, signal) => f.permit(req, action, signal))).toEqual(command);
    expect(f.evalCall).toHaveBeenCalledTimes(1);
    f.evalCall.mockResolvedValue(0); const denied = request();
    expect(await readIdentityContactEditorCommandRequest(denied, origin, (action, signal) => f.permit(denied, action, signal))).toBeNull();
    expect(denied.bodyUsed).toBe(false);
  });
  it.each([0, "1", true, null, undefined, [1], { result: 1 }, 2])("denies nonliteral grant %j", async result => {
    const f = fixture(); f.evalCall.mockResolvedValue(result); expect(await f.run()).toBe(false); expect(f.evalCall).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { ...policy, namespace: "bad{}" }, { ...policy, window_ms: 999 }, { ...policy, window_ms: 3600001 },
    { ...policy, command_limit: 0 }, { ...policy, command_limit: 1.5 }, { ...policy, command_limit: 1000001 },
    { ...policy, work_limit: 12 }, { ...policy, work_limit: 1000001 }, { ...policy, extra: true }])("denies invalid policy %j before I/O", async bad => {
    const f = fixture({ policy: bad }); expect(await f.run()).toBe(false); expect(f.readTrustedMetadata).not.toHaveBeenCalled(); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it.each([null, new Uint8Array(31), new Uint8Array(65)])("denies invalid key before metadata %j", async bad => {
    const f = fixture({ key: bad }); expect(await f.run()).toBe(false); expect(f.readTrustedMetadata).not.toHaveBeenCalled(); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it.each(["initialize_contact_block", "add_contact_block", "issue", "constructor", "__proto__", null])("denies caller-selected action %j", async action => {
    const f = fixture(); expect(await f.permit(request(), action as "identity_contact_command", new AbortController().signal)).toBe(false);
    expect(f.readTrustedMetadata).not.toHaveBeenCalled(); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it.each([null, {}, { address: "192.0.2.1", owner: "forged" }, { address: "192.0.2.1,192.0.2.2" }, { address: "127.1" },
    { address: "[2001:db8::1]" }, { address: "fe80::1%eth0" }, { address: " 192.0.2.1" }])("denies metadata without header fallback %j", async value => {
    const f = fixture(); f.readTrustedMetadata.mockResolvedValue(value); expect(await f.run()).toBe(false); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it("snapshots explicit policy and key and uses fresh metadata on every call", async () => {
    const mutablePolicy = { ...policy }, mutableKey = new Uint8Array(key); const f = fixture({ policy: mutablePolicy, key: mutableKey });
    mutablePolicy.namespace = "other"; mutablePolicy.command_limit = 100; mutableKey.fill(8);
    expect(await f.run()).toBe(true); expect(await f.run()).toBe(true);
    expect(f.evalCall.mock.calls[0]).toEqual(f.evalCall.mock.calls[1]); expect(f.readTrustedMetadata).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(f.evalCall.mock.calls)).toContain('"10"'); expect(JSON.stringify(f.evalCall.mock.calls)).not.toContain("other");
  });
  it.each(["metadata", "redis"] as const)("denies %s error without retry or details", async phase => {
    const f = fixture(); (phase === "metadata" ? f.readTrustedMetadata : f.evalCall).mockRejectedValue(new Error("private provider detail"));
    expect(await f.run()).toBe(false); expect(f.readTrustedMetadata).toHaveBeenCalledTimes(1); expect(f.evalCall).toHaveBeenCalledTimes(phase === "redis" ? 1 : 0);
  });
  it.each(["request", "operation"] as const)("denies pre-aborted %s before metadata", async which => {
    const aborted = new AbortController(); aborted.abort(); const f = fixture();
    expect(await f.run(which === "request" ? request(aborted.signal) : request(), which === "operation" ? aborted.signal : new AbortController().signal)).toBe(false);
    expect(f.readTrustedMetadata).not.toHaveBeenCalled(); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it.each(["request", "operation"] as const)("stops promptly during pending Redis on %s abort, never revives", async which => {
    const controller = new AbortController(), f = fixture(); let finish!: (value: unknown) => void;
    f.evalCall.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const req = which === "request" ? request(controller.signal) : request();
    const pending = f.run(req, which === "operation" ? controller.signal : new AbortController().signal);
    await vi.waitFor(() => expect(f.evalCall).toHaveBeenCalledTimes(1)); controller.abort();
    expect(await pending).toBe(false); finish(1); await Promise.resolve(); expect(await pending).toBe(false); expect(f.evalCall).toHaveBeenCalledTimes(1);
  });
  it("does not start EVAL after operation abortion during trusted metadata", async () => {
    const f = fixture(), controller = new AbortController(); let finish!: (value: unknown) => void;
    f.readTrustedMetadata.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.run(request(), controller.signal); controller.abort(); expect(await pending).toBe(false);
    finish({ address: "192.0.2.1" }); await Promise.resolve(); await Promise.resolve(); expect(f.evalCall).not.toHaveBeenCalled();
  });
  it("subject timeout cannot start a late EVAL", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); let finish!: (value: unknown) => void;
      f.readTrustedMetadata.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = f.run(); await vi.advanceTimersByTimeAsync(500); expect(await pending).toBe(false);
      finish({ address: "192.0.2.1" }); await vi.advanceTimersByTimeAsync(0); expect(f.evalCall).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("uses one aggregate2s deadline including subject time, with no late grant or retry", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(); let finish!: (value: unknown) => void;
      f.readTrustedMetadata.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve({ address: "192.0.2.1" }), 400)));
      f.evalCall.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const pending = f.run(); await vi.advanceTimersByTimeAsync(1999); expect(f.evalCall).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1); expect(await pending).toBe(false); finish(1);
      await vi.advanceTimersByTimeAsync(0); expect(await pending).toBe(false); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY])("denies nonfinite start %s before metadata", async now => {
    vi.spyOn(performance, "now").mockReturnValue(now); const f = fixture(); expect(await f.run()).toBe(false); expect(f.readTrustedMetadata).not.toHaveBeenCalled();
  });
  it.each([99, 2100, Number.NaN])("denies backward/late/nonfinite Redis completion %s even before timer callback", async now => {
    let clock = 100; vi.spyOn(performance, "now").mockImplementation(() => clock); const f = fixture();
    f.evalCall.mockImplementation(async () => { clock = now; return 1; }); expect(await f.run()).toBe(false);
  });
  it("cleans listeners and timers on a successful grant", async () => {
    vi.useFakeTimers(); try {
      const f = fixture(), req = request(), signal = new AbortController().signal;
      const removeRequest = vi.spyOn(req.signal, "removeEventListener"), removeOperation = vi.spyOn(signal, "removeEventListener");
      expect(await f.run(req, signal)).toBe(true); expect(vi.getTimerCount()).toBe(0);
      expect(removeRequest).toHaveBeenCalledWith("abort", expect.any(Function)); expect(removeOperation).toHaveBeenCalledWith("abort", expect.any(Function));
    } finally { vi.useRealTimers(); }
  });
});

it.each([
  ["spall-identity-link-editor", createIdentityLinkEditorNetworkSubject],
  ["spall-identity-text-editor", createIdentityTextEditorNetworkSubject],
] as const)("keeps Contact Redis keys separate from %s at the same namespace/IP", async (domain, create) => {
  const f = fixture(); expect(await f.run()).toBe(true);
  const subject = await create({ namespace: "test", key, readTrustedMetadata: f.readTrustedMetadata })(request());
  const digest = createHash("sha256").update(`test\0${subject}`).digest("hex");
  expect(JSON.stringify(f.evalCall.mock.calls)).not.toContain(digest);
  expect(JSON.stringify(f.evalCall.mock.calls)).not.toContain(`${domain}:`);
});
it.each(["add_contact_block", "initialize_contact_block", "save_contact_block"])("body %s never selects a different permit cost or identity", async action => {
  const f = fixture(), req = new Request(`${origin}/staged`, { method: "POST", body: JSON.stringify({ action, owner_id: "forged", cost: 0 }) });
  expect(await f.run(req)).toBe(true); expect(req.bodyUsed).toBe(false);
  expect(f.evalCall.mock.calls[0]![2]).toEqual(["60000", "10", "130", "13"]);
});

it.each(["::ffff:192.0.2.1", "0:0:0:0:0:ffff:c000:201", "192.0.2.1"])("canonical address %s charges the same partition", async address => {
  const original = fixture(), equivalent = fixture(); equivalent.readTrustedMetadata.mockResolvedValue({ address });
  expect(await original.run()).toBe(true); expect(await equivalent.run()).toBe(true);
  expect(equivalent.evalCall.mock.calls).toEqual(original.evalCall.mock.calls);
});
