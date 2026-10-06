import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), claims: vi.fn(), pending: vi.fn(), scan: vi.fn(), redirect: vi.fn(), destination: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/external-destination/safety", () => ({ ensureExternalDestinationPending: mocks.pending }));
vi.mock("@/lib/external-destination/trusted-recorder", () => ({ scanAndRecordPendingExternalDestination: mocks.scan }));
vi.mock("@/lib/auth/resolved-destination", () => ({ resolveCurrentOwnerDestination: mocks.destination }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { saveProductPreparationAction } from "./product-preparation-actions";
const previous = { status: "idle" as const, message: null, destinations: "", primaryAssetKey: "" };
const url = "https://shopee.co.id/item?affiliate=creator&campaign=A%2FB";
function form(values: Record<string,string> = {}) {
  const data = new FormData();
  for (const [key,value] of Object.entries({ baseProductRevision: "2", basePreparationRevision: "", productPrimaryAssetKey: "", marketplaceDestinations: url, ...values })) data.set(key,value);
  return data;
}
const ack = () => ({ status: "success", current_step: "relevant_first_job", product_revision: 2,
  preparation: { primary_asset_key: null, destinations: [{ provider_key: "shopee", destination_url: url }], revision: 1 } });
describe("Product preparation save boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({ auth: { getClaims: mocks.claims }, schema: () => ({ rpc: mocks.rpc }) });
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "owner-auth-id" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: ack(), error: null });
    mocks.pending.mockResolvedValue({ requiresScan: true }); mocks.scan.mockResolvedValue(undefined);
    mocks.destination.mockResolvedValue("/login");
    mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); });
  });
  it("preserves affiliate attribution and scans only after an exact acknowledged save", async () => {
    await expect(saveProductPreparationAction(previous, form())).rejects.toThrow("redirect:/onboarding");
    expect(mocks.rpc).toHaveBeenCalledWith("save_current_product_preparation", {
      input_primary_asset_key: null, input_destinations: ack().preparation.destinations,
      base_product_revision: 2, base_preparation_revision: null,
    });
    expect(mocks.pending).toHaveBeenCalledWith(url);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.pending.mock.invocationCallOrder[0]!);
  });
  it.each([
    { baseProductRevision: "" }, { basePreparationRevision: "-1" }, { productPrimaryAssetKey: "https://image.test/x" },
    { marketplaceDestinations: "https://localhost/x" }, { marketplaceDestinations: "javascript:alert(1)" },
    { marketplaceDestinations: `${url}\nhttps://shope.ee/duplicate` },
    { marketplaceDestinations: Array.from({length: 11},(_,i) => `https://shop${i}.example.com/x`).join("\n") },
  ])("rejects invalid input without persistence or scanner calls: %j", async (values) => {
    const result = await saveProductPreparationAction(previous, form(values));
    expect(result.status).toBe("error"); expect(mocks.client).not.toHaveBeenCalled(); expect(mocks.pending).not.toHaveBeenCalled();
    expect(result.destinations).toBe(form(values).get("marketplaceDestinations"));
  });
  it.each(["stale_write", "invalid_image", "invalid_destinations", "product_missing", "revision_exhausted"])(
    "retains input and never scans rejected %s saves", async (status) => {
      mocks.rpc.mockResolvedValue({ data: { status }, error: null });
      expect((await saveProductPreparationAction(previous, form())).status).toBe("error");
      expect(mocks.pending).not.toHaveBeenCalled();
    });
  it.each(["owner_not_eligible", "owner_missing", "unauthenticated"])("routes %s through current Owner authority", async (status) => {
    mocks.rpc.mockResolvedValue({ data: { status }, error: null });
    await expect(saveProductPreparationAction(previous, form())).rejects.toThrow("redirect:/login");
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("requires verified claims before RPC", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: { message: "expired" } });
    await expect(saveProductPreparationAction(previous, form())).rejects.toThrow("redirect:/login"); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, { ...ack(), product_revision: 3 }, { ...ack(), owner_id: "unexpected" },
    { ...ack(), preparation: { ...ack().preparation, revision: 3 } },
    { ...ack(), preparation: { ...ack().preparation, destinations: [] } }])("never trusts malformed acknowledgment %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await saveProductPreparationAction(previous, form())).status).toBe("error"); expect(mocks.pending).not.toHaveBeenCalled();
  });
  it.each(["registration", "scanner"])("preserves committed private preparation on %s failure", async (where) => {
    if (where === "registration") mocks.pending.mockRejectedValue(new Error("unavailable"));
    else mocks.scan.mockRejectedValue(new Error("unavailable"));
    await expect(saveProductPreparationAction(previous, form())).rejects.toThrow("redirect:/onboarding"); expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it("handles lost persistence responses without scanning or claiming a save", async () => {
    mocks.rpc.mockRejectedValue(new Error("network"));
    expect((await saveProductPreparationAction(previous, form())).status).toBe("error"); expect(mocks.pending).not.toHaveBeenCalled();
  });
});
