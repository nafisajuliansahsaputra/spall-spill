import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getClaims: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { resolveCurrentResourceDraftState } from "./resource-draft";
describe("Resource Draft authoritative read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getClaims: mocks.getClaims }, schema: () => ({ rpc: mocks.rpc }) });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "76000000-0000-4000-8000-000000000001" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: { status: "success", current_step: "relevant_first_job", resource_draft: null }, error: null });
  });
  it("does not create content on an empty acknowledged read", async () => {
    expect(await resolveCurrentResourceDraftState()).toEqual({ status: "success", current_step: "relevant_first_job", resource_draft: null });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("resolve_current_resource_draft_state");
  });
  it("rejects unauthenticated reads before RPC", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("unauthenticated") });
    expect(await resolveCurrentResourceDraftState()).toEqual({ status: "unauthenticated" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { status: "success", current_step: "claim_handle", resource_draft: null },
    { status: "success", current_step: "relevant_first_job", resource_draft: { resource_type: "pdf", source_url: null, title: "Menu", revision: 1 } },
    { status: "success", current_step: "relevant_first_job", resource_draft: { resource_type: "menu", source_url: null, title: null, revision: 1 } },
    { status: "success", current_step: "relevant_first_job", resource_draft: { resource_type: "menu", source_url: "javascript:alert(1)", title: null, revision: 1 } },
    { status: "success", current_step: "relevant_first_job", resource_draft: null, owner_id: "foreign" },
    { status: "unauthenticated" }, null,
  ])("fails closed on invalid/inconsistent database state: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(resolveCurrentResourceDraftState()).rejects.toThrow();
  });
  it("does not treat a transport failure as missing content", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("unavailable") });
    await expect(resolveCurrentResourceDraftState()).rejects.toThrow();
  });
});
