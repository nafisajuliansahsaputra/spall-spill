import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), claims: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { resolveCurrentProductPreparation } from "./product-preparation";
const empty = { status: "success", current_step: "relevant_first_job", product_revision: null, preparation: null };
describe("private Product preparation authoritative read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({ auth: { getClaims: mocks.claims }, schema: () => ({ rpc: mocks.rpc }) });
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "81000000-0000-4000-8000-000000000001" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: empty, error: null });
  });
  it("accepts a verified empty read without creating content", async () => {
    expect(await resolveCurrentProductPreparation()).toEqual(empty);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("resolve_current_product_preparation");
  });
  it("requires verified subject before querying", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: new Error("expired") });
    await expect(resolveCurrentProductPreparation()).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([null, { ...empty, current_step: "claim_handle" }, { ...empty, owner_id: "foreign" },
    { ...empty, preparation: { primary_asset_key: null, destinations: [], revision: 1 } },
    { ...empty, product_revision: 1, preparation: { primary_asset_key: "https://image.test/raw", destinations: [], revision: 1 } }])(
    "rejects inconsistent or private-field-bearing state: %j", async (data) => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      await expect(resolveCurrentProductPreparation()).rejects.toThrow();
    });
  it("never represents RPC failure as an empty read", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("unavailable") });
    await expect(resolveCurrentProductPreparation()).rejects.toThrow();
  });
});
