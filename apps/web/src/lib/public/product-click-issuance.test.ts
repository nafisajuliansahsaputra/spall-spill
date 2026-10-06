import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createPublishedProductClickIssuance } from "./product-click-issuance";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const url = "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB";
const locator = { handle: "creator", spill_reference: 27, provider_key: "shopee" };
const confirmation = { status: "success", current_handle: "creator", display_name: "Published Owner",
  spill_reference: 27, title: "Published Product", primary_image_path: "/media/product/creator/27",
  destinations: [{ provider_key: "shopee", available: true, destination_url: url }] };
const binding = { ...locator, publication_token: "a".repeat(64), destination_hash: hash(url) };
const context = { status: "success", confirmation, binding };
function fixture() {
  let stored: unknown;
  const events: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    events.push(name);
    if (name === "resolve_published_product_click_context_server") return { data: context, error: null };
    if (name === "resolve_published_product_destination_server") return { data: { status: "success", destination_url: url }, error: null };
    if (name === "create_product_click_intent_server") { stored = args.input_record; return { data: true, error: null }; }
    if (name === "consume_product_click_intent_server") { const data = stored; stored = null; return { data, error: null }; }
    return { data: 0, error: null };
  });
  const schema = vi.fn(() => ({ rpc }));
  const issuance = createPublishedProductClickIssuance({ schema } as unknown as Pick<SupabaseClient, "schema">, () => 100_000);
  return { issuance, rpc, schema, events };
}
describe("staged exact Published Product issuance", () => {
  it("issues only after trusted context, current resolution and durable acknowledgment", async () => {
    const f = fixture(); const result = await f.issuance.issue(locator);
    expect(result?.confirmation).toEqual(confirmation); expect(result?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Object.keys(result!)).toEqual(["confirmation", "token"]);
    expect(JSON.stringify(result)).not.toContain(binding.publication_token);
    expect(JSON.stringify(result)).not.toContain(binding.destination_hash);
    expect(f.events).toEqual(["resolve_published_product_click_context_server", "resolve_published_product_destination_server", "create_product_click_intent_server"]);
    expect(f.rpc).toHaveBeenNthCalledWith(1,"resolve_published_product_click_context_server", {
      input_handle: "creator", input_spill_reference: 27, input_provider_key: "shopee",
    });
    expect(await f.issuance.redeem(result!.token, locator)).toBe(url);
    expect(f.events.slice(-2)).toEqual(["consume_product_click_intent_server", "resolve_published_product_destination_server"]);
    expect(await f.issuance.redeem(result!.token, locator)).toBeNull();
  });
  it("preserves the server-derived canonical Handle for a protected alias", async () => {
    const f = fixture(); const result = await f.issuance.issue({ ...locator, handle: "old-handle" });
    expect(result?.confirmation.current_handle).toBe("creator");
    expect(await f.issuance.redeem(result!.token, locator)).toBe(url);
    expect(f.rpc).toHaveBeenNthCalledWith(1,"resolve_published_product_click_context_server", {
      input_handle: "old-handle", input_spill_reference: 27, input_provider_key: "shopee",
    });
  });
  it.each([null, {}, { ...locator, confirmation }, { ...locator, binding },
    { ...locator, publication_token: binding.publication_token }, { ...locator, destination_url: url },
    { ...locator, owner_id: "forged" }, { ...locator, spill_reference: 0 }, { ...locator, provider_key: "spoof" },
  ])("rejects non-locator caller authority %j before RPC", async (input) => {
    const f = fixture(); expect(await f.issuance.issue(input)).toBeNull(); expect(f.schema).not.toHaveBeenCalled();
  });
  it.each([null, { status: "unavailable" }, { ...context, private: "field" },
    { ...context, confirmation: { ...confirmation, owner_id: "private" } },
    { ...context, binding: { ...binding, spill_reference: 28 } },
    { ...context, binding: { ...binding, provider_key: "tokopedia" } },
    { ...context, binding: { ...binding, handle: "wrong-owner" } },
    { ...context, binding: { ...binding, destination_hash: "b".repeat(64) } },
    { ...context, confirmation: { ...confirmation, destinations: [{ provider_key: "shopee", available: false, destination_url: null }] } },
  ])("denies malformed or mismatched server context %j", async (data) => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data, error: null });
    expect(await f.issuance.issue(locator)).toBeNull(); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, { message: "permission denied" }])("denies incomplete/error context response %j", async (error) => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data: context, error });
    expect(await f.issuance.issue(locator)).toBeNull(); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("denies context exceptions without retry", async () => {
    const f = fixture(); f.rpc.mockRejectedValueOnce(new Error("unavailable"));
    expect(await f.issuance.issue(locator)).toBeNull(); expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null, { status: "unavailable" }, { status: "success", destination_url: "https://shopee.co.id/other" }])("denies fresh resolution %j without creating", async (data) => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data: context, error: null }).mockResolvedValueOnce({ data, error: null });
    expect(await f.issuance.issue(locator)).toBeNull(); expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it("denies a failed durable acknowledgment without exposing an intent", async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({ data: context, error: null })
      .mockResolvedValueOnce({ data: { status: "success", destination_url: url }, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    expect(await f.issuance.issue(locator)).toBeNull(); expect(f.rpc).toHaveBeenCalledTimes(3);
  });
  it("delegates one bounded cleanup without enabling a schedule", async () => {
    const f = fixture(); expect(await f.issuance.cleanup(10)).toBe(0);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith("cleanup_product_click_intents_server", { input_limit: 10 });
  });
});
