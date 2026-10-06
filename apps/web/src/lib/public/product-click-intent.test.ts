import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createPublishedProductClickIntentCore, type ProductClickIntentRecord, type ProductClickIntentStore } from "./product-click-intent";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const url = "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB";
const binding = { handle: "creator", spill_reference: 27, provider_key: "shopee",
  publication_token: "a".repeat(64), destination_hash: hash(url) };
const context = { handle: "creator", spill_reference: 27, provider_key: "shopee" };
const confirmation = { status: "success", current_handle: "creator", display_name: "Published Owner",
  spill_reference: 27, title: "Published Product", primary_image_path: "/media/product/creator/27",
  destinations: [{ provider_key: "shopee", available: true, destination_url: url }] };
function fixture() {
  let time = 100_000;
  // Test-only synchronous atomic Map operations; no production persistence claim.
  const records = new Map<string, unknown>();
  const store: ProductClickIntentStore = {
    create: vi.fn(async (key, record) => {
      if (records.has(key)) return false;
      records.set(key, structuredClone(record));
      return true;
    }),
    consume: vi.fn(async (key) => {
      const record = records.get(key); records.delete(key); return record;
    }),
  };
  const resolve = vi.fn(async (): Promise<unknown> => ({ status: "success", destination_url: url }));
  const core = createPublishedProductClickIntentCore({ store, resolve, now: () => time });
  return { core, store, resolve, records, setTime: (value: number) => { time = value; } };
}
describe("staged Published Product click-intent core", () => {
  it("issues an opaque random capability, stores only its hash and retains exact original attribution", async () => {
    const f = fixture(); const original = structuredClone(confirmation);
    const token = await f.core.issue(confirmation, binding);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token!, "base64url")).toHaveLength(32);
    expect(token).not.toContain("creator"); expect(token).not.toContain(binding.publication_token);
    expect(f.records.has(token!)).toBe(false);
    expect(f.records.get(hash(token!))).toEqual({ purpose: "published-product-click-v1", binding,
      confirmation_hash: hash(JSON.stringify(confirmation)), issued_at: 100_000, expires_at: 220_000 });
    expect(JSON.stringify([...f.records.values()])).not.toContain(token!);
    expect(await f.core.redeem(token, { ...context, handle: "CREATOR" })).toBe(url);
    expect(confirmation).toEqual(original);
  });
  it("issues distinct capabilities for the same confirmation without overwriting records", async () => {
    const f = fixture(); const one = await f.core.issue(confirmation, binding); const two = await f.core.issue(confirmation, binding);
    expect(one).not.toBe(two); expect(f.records.size).toBe(2);
  });
  it.each([
    [null, binding], [{ status: "unavailable" }, binding], [{ ...confirmation, owner_id: "private" }, binding],
    [{ ...confirmation, title: "" }, binding], [{ ...confirmation, primary_image_path: "https://foreign.example.test/a" }, binding],
    [{ ...confirmation, destinations: [{ provider_key: "shopee", available: false, destination_url: null }] }, binding],
    [confirmation, { ...binding, handle: "other" }], [confirmation, { ...binding, spill_reference: 28 }],
    [confirmation, { ...binding, provider_key: "tokopedia" }], [confirmation, { ...binding, destination_hash: "0".repeat(64) }],
    [confirmation, { ...binding, publication_token: "private" }], [confirmation, { ...binding, destination_url: url }],
  ])("rejects unbound/private/unavailable issuance %j", async (payload, request) => {
    const f = fixture(); expect(await f.core.issue(payload, request)).toBeNull();
    expect(f.resolve).not.toHaveBeenCalled(); expect(f.store.create).not.toHaveBeenCalled();
  });
  it.each([null, { status: "unavailable" }, { status: "success", destination_url: "https://shopee.co.id/replaced" },
    { status: "success", destination_url: url, private_token: "private" }])("rechecks current Published safety before issuance %j", async (result) => {
    const f = fixture(); f.resolve.mockResolvedValue(result);
    expect(await f.core.issue(confirmation, binding)).toBeNull(); expect(f.store.create).not.toHaveBeenCalled();
  });
  it("denies create collision/failure rather than overwrite or return an unstored token", async () => {
    const f = fixture(); vi.mocked(f.store.create).mockResolvedValue(false);
    expect(await f.core.issue(confirmation, binding)).toBeNull(); expect(f.records.size).toBe(0);
  });
  it("requires an explicit successful storage acknowledgement", async () => {
    const f = fixture(); vi.mocked(f.store.create).mockResolvedValue("success" as never);
    expect(await f.core.issue(confirmation, binding)).toBeNull();
  });
  it("denies resolver exceptions during issuance before storage", async () => {
    const f = fixture(); f.resolve.mockRejectedValue(new Error("private"));
    expect(await f.core.issue(confirmation, binding)).toBeNull(); expect(f.store.create).not.toHaveBeenCalled();
  });
  it.each([null, 27, "", "a".repeat(42), "a".repeat(44), "../creator", "a".repeat(42) + "B"])("rejects malformed/noncanonical opaque tokens %j", async (token) => {
    const f = fixture(); expect(await f.core.redeem(token, context)).toBeNull(); expect(f.store.consume).not.toHaveBeenCalled();
  });
  it("denies tampering and unknown canonical tokens without resolving a destination", async () => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding);
    const tampered = (token![0] === "A" ? "E" : "A") + token!.slice(1);
    expect(await f.core.redeem(tampered, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(1);
    expect(await f.core.redeem(token, context)).toBe(url);
  });
  it.each([{ ...context, handle: "other" }, { ...context, spill_reference: 28 }, { ...context, provider_key: "tokopedia" }])("burns cross-context/provider attempts %j", async (expected) => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding);
    expect(await f.core.redeem(token, expected)).toBeNull(); expect(await f.core.redeem(token, context)).toBeNull();
    expect(f.resolve).toHaveBeenCalledTimes(1);
  });
  it("rejects raw private bindings as public redemption context before consumption", async () => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding);
    expect(await f.core.redeem(token, binding)).toBeNull(); expect(f.store.consume).not.toHaveBeenCalled();
  });
  it.each([null, { purpose: "another-purpose" }, { private_token: "private" }])("denies malformed/private persisted records %j", async (record) => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding); f.records.set(hash(token!), record);
    expect(await f.core.redeem(token, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(1);
  });
  it.each([99_999, 220_000, Number.NaN, Number.POSITIVE_INFINITY])("denies future issuance/expiry/invalid clock %j", async (time) => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding); f.setTime(time);
    expect(await f.core.redeem(token, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(1);
  });
  it("rejects a stored record extending the fixed lifetime", async () => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding);
    const record = f.records.get(hash(token!)) as ProductClickIntentRecord;
    f.records.set(hash(token!), { ...record, expires_at: 220_001 });
    expect(await f.core.redeem(token, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(1);
  });
  it("permits only one competing redemption and refuses subsequent replay", async () => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding);
    expect((await Promise.all([f.core.redeem(token, context), f.core.redeem(token, context)])).sort()).toEqual([url, null].sort());
    expect(await f.core.redeem(token, context)).toBeNull(); expect(f.resolve).toHaveBeenCalledTimes(2);
  });
  it.each([null, { status: "unavailable" }, { status: "success", destination_url: "https://shopee.co.id/item?affiliate=other" },
    { status: "success", destination_url: "javascript:alert(1)" }, { status: "success", destination_url: url, safety_reason: "private" }])("rechecks safety/exact URL after consumption and burns failed actions %j", async (result) => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding); f.resolve.mockResolvedValue(result);
    expect(await f.core.redeem(token, context)).toBeNull(); expect(await f.core.redeem(token, context)).toBeNull();
    expect(f.resolve).toHaveBeenCalledTimes(2);
  });
  it.each([220_000, 99_999])("rechecks time after asynchronous resolution %j", async (time) => {
    const f = fixture(); const token = await f.core.issue(confirmation, binding);
    f.resolve.mockImplementation(async () => { f.setTime(time); return { status: "success", destination_url: url }; });
    expect(await f.core.redeem(token, context)).toBeNull(); expect(await f.core.redeem(token, context)).toBeNull();
  });
  it("retains independent provider intent when another provider degrades", async () => {
    const f = fixture(); const other = "https://store.example.test/item?creator=original";
    const alternative = { provider_key: "external:store.example.test", available: true, destination_url: other };
    const payload = { ...confirmation, destinations: [...confirmation.destinations, alternative] };
    const one = await f.core.issue(payload, binding);
    f.resolve.mockResolvedValue({ status: "success", destination_url: other });
    const two = await f.core.issue(payload, { ...binding, provider_key: alternative.provider_key, destination_hash: hash(other) });
    expect(await f.core.redeem(one, context)).toBeNull();
    expect(await f.core.redeem(two, { ...context, provider_key: alternative.provider_key })).toBe(other);
    expect(payload.destinations).toHaveLength(2);
  });
  it.each(["create", "consume", "resolve"] as const)("denies infrastructure exceptions without disclosing error %s", async (failure) => {
    const f = fixture();
    if (failure === "create") { vi.mocked(f.store.create).mockRejectedValue(new Error("private")); expect(await f.core.issue(confirmation, binding)).toBeNull(); }
    else {
      const token = await f.core.issue(confirmation, binding);
      if (failure === "consume") vi.mocked(f.store.consume).mockRejectedValue(new Error("private"));
      else f.resolve.mockRejectedValue(new Error("private"));
      expect(await f.core.redeem(token, context)).toBeNull();
    }
  });
  it("denies invalid issue time and expiry during slow storage", async () => {
    const f = fixture(); f.setTime(Number.NaN); expect(await f.core.issue(confirmation, binding)).toBeNull();
    expect(f.store.create).not.toHaveBeenCalled(); f.setTime(100_000);
    vi.mocked(f.store.create).mockImplementation(async () => { f.setTime(220_000); return true; });
    expect(await f.core.issue(confirmation, binding)).toBeNull();
  });
});
