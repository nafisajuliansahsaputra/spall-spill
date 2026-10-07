import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPublishedResourceOpenIntentCore, type ResourceOpenIntentRecord, type ResourceOpenIntentStore } from "./resource-open-intent";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const url = "https://portfolio.example.test/works?creator=original&campaign=A%2FB";
const binding = { handle: "creator", spill_reference: 27, publication_token: "a".repeat(64), source_hash: hash(url) };
const recognition = { status: "success", current_handle: "creator", display_name: "Published Owner", spill_reference: 27,
  resource_type: "portfolio", title: "Published Portfolio", available: true, source_url: url };
const serverContext = { status: "success", recognition, binding };
const locator = { handle: "previous", reference: "#27" };
const context = { handle: "creator", spill_reference: 27 };
const source = { status: "success", source_url: url };

function fixture() {
  let time = 100_000;
  // Explicit test-only atomic store, never production persistence evidence.
  const records = new Map<string, unknown>();
  const store: ResourceOpenIntentStore = {
    create: vi.fn(async (key, record) => { if (records.has(key)) return false; records.set(key, record); return true; }),
    consume: vi.fn(async key => { const record = records.get(key); records.delete(key); return record; }),
  };
  const resolve = vi.fn(async (): Promise<unknown> => source);
  const core = createPublishedResourceOpenIntentCore({ store, resolve, now: () => time });
  return { core, store, resolve, records, setTime: (value: number) => { time = value; } };
}

describe("staged Published Resource Open intent core", () => {
  it("issues an opaque capability, stores only its hash and redeems original attribution once", async () => {
    const f = fixture(); const input = structuredClone(serverContext);
    const token = await f.core.issue(Object.freeze(locator), Object.freeze(input));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(Buffer.from(token!, "base64url")).toHaveLength(32);
    expect(f.records.get(hash(token!))).toEqual({ purpose: "published-resource-open-v1", binding,
      recognition_hash: hash(JSON.stringify(recognition)), issued_at: 100_000, expires_at: 220_000 });
    expect(f.records.has(token!)).toBe(false);
    const stored = JSON.stringify([...f.records.values()]);
    expect(stored).not.toContain(token!); expect(stored).not.toContain(url);
    expect(stored).not.toContain("provider_key"); expect(stored).not.toContain("owner_id");
    expect(await f.core.redeem(token, { ...context, handle: "CREATOR" })).toBe(url);
    expect(await f.core.redeem(token, context)).toBeNull(); expect(input).toEqual(serverContext);
  });
  it("issues independent capabilities without changing recognition or publication", async () => {
    const f = fixture(); const first = await f.core.issue(locator, serverContext); const second = await f.core.issue(locator, serverContext);
    expect(first).not.toBe(second); expect(f.records.size).toBe(2);
    f.resolve.mockResolvedValueOnce({ status: "unavailable" }); expect(await f.core.redeem(first, context)).toBeNull();
    expect(await f.core.redeem(second, context)).toBe(url); expect(serverContext.recognition.available).toBe(true);
  });
  it.each([null, { status: "unavailable" }, recognition, { ...serverContext, owner_id: "private" },
    { ...serverContext, binding: null }, { ...serverContext, recognition: { ...recognition, title: "" } },
    { ...serverContext, recognition: { ...recognition, available: false, source_url: null }, binding: null },
    { ...serverContext, binding: { ...binding, handle: "other" } },
    { ...serverContext, binding: { ...binding, spill_reference: 28 } },
    { ...serverContext, binding: { ...binding, source_hash: "0".repeat(64) } },
    { ...serverContext, binding: { ...binding, publication_token: "private" } },
    { ...serverContext, binding: { ...binding, provider_key: "marketplace" } }])(
    "denies malformed/private/degraded/unbound server context before dependencies", async payload => {
      const f = fixture(); expect(await f.core.issue(locator, payload)).toBeNull();
      expect(f.resolve).not.toHaveBeenCalled(); expect(f.store.create).not.toHaveBeenCalled();
    });
  it.each([null, {}, { ...locator, reference: "28" }, { ...locator, reference: 27 }, { ...locator, source_url: url }])(
    "denies invalid/wrong-reference locator", async input => {
      const f = fixture(); expect(await f.core.issue(input, serverContext)).toBeNull(); expect(f.resolve).not.toHaveBeenCalled();
    });
  it("contains hostile getters without dependency calls", async () => {
    const f = fixture(); const hostile = { get handle() { throw new Error("private reason"); } };
    expect(await f.core.issue(hostile, serverContext)).toBeNull(); expect(await f.core.redeem("a".repeat(43), hostile)).toBeNull();
    expect(f.resolve).not.toHaveBeenCalled(); expect(f.store.consume).not.toHaveBeenCalled();
  });
  it.each([null, { status: "unavailable" }, url, { ...source, private_reason: "blocked" },
    { ...source, source_url: "https://foreign.example.test/" }])("requires fresh exact safe source before storage", async result => {
    const f = fixture(); f.resolve.mockResolvedValue(result); expect(await f.core.issue(locator, serverContext)).toBeNull();
    expect(f.store.create).not.toHaveBeenCalled();
  });
  it.each([false, "success", null])("requires explicit true create acknowledgement without retry", async acknowledgement => {
    const f = fixture(); vi.mocked(f.store.create).mockResolvedValue(acknowledgement as never);
    expect(await f.core.issue(locator, serverContext)).toBeNull(); expect(f.store.create).toHaveBeenCalledTimes(1);
  });
  it("denies source resolver exception before issuance storage", async () => {
    const f = fixture(); f.resolve.mockRejectedValue(new Error("private resolver reason"));
    expect(await f.core.issue(locator, serverContext)).toBeNull(); expect(f.store.create).not.toHaveBeenCalled();
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, Number.MAX_SAFE_INTEGER, 1.5])("denies invalid/overflow issuance clock", async time => {
    const f = fixture(); f.setTime(time); expect(await f.core.issue(locator, serverContext)).toBeNull();
    expect(f.store.create).not.toHaveBeenCalled();
  });
  it.each([99_999, 220_000, Number.NaN])("denies late storage or backward/invalid return clock", async time => {
    const f = fixture(); vi.mocked(f.store.create).mockImplementation(async () => { f.setTime(time); return true; });
    expect(await f.core.issue(locator, serverContext)).toBeNull(); expect(f.store.create).toHaveBeenCalledTimes(1);
  });
  it.each([null, 27, "", "a".repeat(42), "a".repeat(44), "../creator", "a".repeat(42) + "B"])(
    "rejects malformed/noncanonical capability before consume", async token => {
      const f = fixture(); expect(await f.core.redeem(token, context)).toBeNull(); expect(f.store.consume).not.toHaveBeenCalled();
    });
  it.each([binding, { ...context, provider_key: "marketplace" }, { ...context, source_url: url },
    { ...context, spill_reference: "27" }, { ...context, owner_id: "private" }])(
    "rejects private/invalid redemption context before consume", async input => {
      const f = fixture(); const token = await f.core.issue(locator, serverContext);
      expect(await f.core.redeem(token, input)).toBeNull(); expect(f.store.consume).not.toHaveBeenCalled();
    });
  it.each([{ ...context, handle: "other" }, { ...context, spill_reference: 28 }])("burns cross-Owner/reference capability", async input => {
    const f = fixture(); const token = await f.core.issue(locator, serverContext);
    expect(await f.core.redeem(token, input)).toBeNull(); expect(await f.core.redeem(token, context)).toBeNull();
    expect(f.resolve).toHaveBeenCalledTimes(1);
  });
  it("denies tampering without burning a different valid token", async () => {
    const f = fixture(); const token = await f.core.issue(locator, serverContext);
    const tampered = (token![0] === "A" ? "E" : "A") + token!.slice(1);
    expect(await f.core.redeem(tampered, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(1);
    expect(await f.core.redeem(token, context)).toBe(url);
  });
  it.each([null, { purpose: "published-product-click-v1" }, { private_token: "private" }])("burns invalid persisted record", async record => {
    const f = fixture(); const token = await f.core.issue(locator, serverContext); f.records.set(hash(token!), record);
    expect(await f.core.redeem(token, context)).toBeNull(); expect(f.records.size).toBe(0); expect(f.resolve).toHaveBeenCalledTimes(1);
  });
  it.each(["purpose", "ttl", "hash", "private"])("rejects strict stored record corruption: %s", async corruption => {
    const f = fixture(); const token = await f.core.issue(locator, serverContext);
    const record = f.records.get(hash(token!)) as ResourceOpenIntentRecord;
    const changes = corruption === "purpose" ? { purpose: "published-product-click-v1" }
      : corruption === "ttl" ? { expires_at: 220_001 } : corruption === "hash" ? { recognition_hash: "private" } : { source_url: url };
    f.records.set(hash(token!), { ...record, ...changes });
    expect(await f.core.redeem(token, context)).toBeNull(); expect(await f.core.redeem(token, context)).toBeNull();
  });
  it.each([99_999, 220_000, Number.NaN, Number.POSITIVE_INFINITY])("burns future/expired/invalid-clock redemption", async time => {
    const f = fixture(); const token = await f.core.issue(locator, serverContext); f.setTime(time);
    expect(await f.core.redeem(token, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(1);
  });
  it("allows only one competing consume and denies replay", async () => {
    const f = fixture(); const token = await f.core.issue(locator, serverContext);
    expect((await Promise.all([f.core.redeem(token, context), f.core.redeem(token, context)])).sort()).toEqual([url, null].sort());
    expect(await f.core.redeem(token, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(2);
  });
  it.each([null, { status: "unavailable" }, { ...source, source_url: url + "&changed=1" },
    { ...source, source_url: "javascript:alert(1)" }, { ...source, private_reason: "private" }])(
    "rechecks current safety/source after consumption and never restores denial", async result => {
      const f = fixture(); const token = await f.core.issue(locator, serverContext); f.resolve.mockResolvedValue(result);
      expect(await f.core.redeem(token, context)).toBeNull(); expect(await f.core.redeem(token, context)).toBeNull();
      expect(f.resolve).toHaveBeenCalledTimes(2);
    });
  it.each([220_000, 99_999, Number.NaN])("rechecks deadline progression after async resolution", async time => {
    const f = fixture(); const token = await f.core.issue(locator, serverContext);
    f.resolve.mockImplementation(async () => { f.setTime(time); return source; });
    expect(await f.core.redeem(token, context)).toBeNull(); expect(await f.core.redeem(token, context)).toBeNull();
  });
  it.each(["create", "consume", "resolve"] as const)("contains infrastructure errors: %s", async failure => {
    const f = fixture();
    if (failure === "create") { vi.mocked(f.store.create).mockRejectedValue(new Error("private")); expect(await f.core.issue(locator, serverContext)).toBeNull(); }
    else {
      const token = await f.core.issue(locator, serverContext);
      if (failure === "consume") vi.mocked(f.store.consume).mockRejectedValue(new Error("private"));
      else f.resolve.mockRejectedValue(new Error("private"));
      expect(await f.core.redeem(token, context)).toBeNull();
    }
  });
  it("supports independent issuance/deadline clocks and final consumed-record resolution", async () => {
    const f = fixture(); const consumed = vi.fn(async (record: ResourceOpenIntentRecord): Promise<unknown> => {
      expect(f.records.size).toBe(0); expect(record.binding).toEqual(binding); return source;
    });
    const core = createPublishedResourceOpenIntentCore({ store: f.store, resolve: f.resolve,
      issueNow: () => 100_000, now: () => 100_005, resolveConsumed: consumed });
    const token = await core.issue(locator, serverContext); expect(token).not.toBeNull();
    expect(await core.redeem(token, context)).toBe(url); expect(consumed).toHaveBeenCalledTimes(1);
    expect(f.resolve).toHaveBeenCalledTimes(1);
  });
});
