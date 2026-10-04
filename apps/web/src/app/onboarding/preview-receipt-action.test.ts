import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), claims: vi.fn(), rpc: vi.fn(), destination: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/auth/action-destination", () => ({ redirectToCurrentOwnerDestination: mocks.destination }));
import { confirmPreviewAction } from "./preview-receipt-action";
import type { PreviewConfirmationState } from "@/lib/onboarding/preview-receipt-contract";
const previous: PreviewConfirmationState = { status: "idle", message: null, receipt: null };
const hash = "a".repeat(64);
const receipt = () => ({ status: "success", receipt_id: "73000000-0000-4000-8000-000000000001", snapshot_hash: hash,
  expires_at: new Date(Date.now() + 600_000).toISOString() });
const form = (value = hash) => { const data = new FormData(); data.set("snapshotHash", value); return data; };
describe("explicit private preview confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({ auth: { getClaims: mocks.claims }, schema: () => ({ rpc: mocks.rpc }) });
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "owner-auth-subject" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: receipt(), error: null });
    mocks.destination.mockImplementation(async () => { throw new Error("redirect:/login"); });
  });
  it("confirms only the digest under current verified session without publication", async () => {
    const result = await confirmPreviewAction(previous, form());
    expect(result.status).toBe("confirmed"); expect(result.message).toContain("Nothing has been published");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("confirm_current_onboarding_preview", { input_snapshot_hash: hash });
  });
  it.each(["", "a".repeat(63), "A".repeat(64), "../other-owner"])("rejects invalid digest %s before client creation", async (value) => {
    expect((await confirmPreviewAction(previous, form(value))).status).toBe("error");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([null, { claims: {} }, { claims: { sub: "" } }])("redirects unverified session without confirming", async (data) => {
    mocks.claims.mockResolvedValue({ data, error: null });
    await expect(confirmPreviewAction(previous, form())).rejects.toThrow("redirect:/login");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["unauthenticated", "owner_missing", "owner_not_eligible", "owner_unavailable", "onboarding_complete"])("routes changed account %s", async (status) => {
    mocks.rpc.mockResolvedValue({ data: { status }, error: null });
    await expect(confirmPreviewAction(previous, form())).rejects.toThrow("redirect:/login");
  });
  it.each([
    null, { status: "stale_preview" }, { ...receipt(), snapshot_hash: "b".repeat(64) },
    { ...receipt(), receipt_id: "untrusted" }, { ...receipt(), expires_at: "2020-01-01T00:00:00Z" },
    { ...receipt(), owner_id: "unexpected" },
  ])("does not claim confirmation on malformed/stale acknowledgment", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    const result = await confirmPreviewAction(previous, form());
    expect(result.status).toBe("error"); expect(result.receipt).toBeNull();
  });
  it("preserves failure truth on transport failure", async () => {
    mocks.rpc.mockResolvedValue({ data: receipt(), error: { message: "unavailable" } });
    expect((await confirmPreviewAction(previous, form())).status).toBe("error");
  });
});
