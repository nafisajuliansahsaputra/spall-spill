vi.mock("@/lib/auth/resolved-destination", () => ({ resolveCurrentOwnerDestination: mocks.destination }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), rpc: vi.fn(), pending: vi.fn(), scan: vi.fn(), destination: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/external-destination/safety", () => ({ ensureExternalDestinationPending: mocks.pending }));
vi.mock("@/lib/external-destination/trusted-recorder", () => ({ scanAndRecordPendingExternalDestination: mocks.scan }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { saveResourceDraftAction } from "./resource-draft-actions";
import type { ResourceDraftActionState } from "@/lib/onboarding/resource-draft-contract";
const previous: ResourceDraftActionState = { status: "idle", message: null, resourceType: "", sourceUrl: "", title: "", fieldErrors: {} };
function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ resourceType: "menu", resourceTitle: "Menu", resourceSourceUrl: "", baseResourceRevision: "", ...values })) data.set(key, value);
  return data;
}
function acknowledgment(source: string | null = null, revision = 1) {
  return { data: { status: "success", current_step: "relevant_first_job", resource_draft: {
    resource_type: "menu", source_url: source, title: "Menu", revision,
  } }, error: null };
}
describe("Resource Draft save boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.destination.mockResolvedValue("/login");
    mocks.createClient.mockResolvedValue({ schema: () => ({ rpc: mocks.rpc }) });
    mocks.rpc.mockResolvedValue(acknowledgment());
    mocks.pending.mockResolvedValue({ requiresScan: true });
    mocks.scan.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); });
  });
  it.each([
    { resourceType: "" }, { resourceType: "pdf" }, { resourceTitle: "", resourceSourceUrl: "" },
    { resourceSourceUrl: "javascript:alert(1)" }, { resourceSourceUrl: "http://localhost/file" },
    { resourceSourceUrl: "https://127.0.0.1/file" }, { resourceSourceUrl: "https://user:password@example.com/file" },
    { resourceTitle: "x".repeat(161) }, { resourceTitle: "A\u0000B" }, { baseResourceRevision: "9007199254740992" },
    { baseResourceRevision: "-1" }, { baseResourceRevision: "1.5" },
  ])("rejects invalid input before database/scanner: %j", async (values) => {
    expect((await saveResourceDraftAction(previous, form(values))).status).toBe("error");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.scan).not.toHaveBeenCalled();
  });
  it("saves title-only Draft without starting a scanner", async () => {
    await expect(saveResourceDraftAction(previous, form())).rejects.toThrow("redirect:/onboarding?step=relevant_first_job");
    expect(mocks.rpc).toHaveBeenCalledWith("save_current_owner_resource_draft", {
      input_resource_type: "menu", input_source_url: null, input_title: "Menu", base_resource_revision: null,
    });
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("scans only the exact acknowledged normalized source after persistence", async () => {
    mocks.rpc.mockResolvedValue(acknowledgment("https://example.com/menu"));
    await expect(saveResourceDraftAction(previous, form({ resourceSourceUrl: "https://EXAMPLE.com/menu" }))).rejects.toThrow("redirect:/onboarding");
    expect(mocks.pending).toHaveBeenCalledWith("https://example.com/menu");
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.pending.mock.invocationCallOrder[0]!);
    expect(mocks.scan).toHaveBeenCalledOnce();
  });
  it.each(["registration", "scanner"])("retains committed private Draft on %s failure", async (where) => {
    mocks.rpc.mockResolvedValue(acknowledgment("https://example.com/menu"));
    if (where === "registration") mocks.pending.mockRejectedValue(new Error("unavailable"));
    else mocks.scan.mockRejectedValue(new Error("unavailable"));
    await expect(saveResourceDraftAction(previous, form({ resourceSourceUrl: "https://example.com/menu" }))).rejects.toThrow("redirect:/onboarding");
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it.each(["stale_write", "invalid_resource_type", "empty_draft", "step_not_available", "prerequisite_missing", "revision_exhausted"])("never scans rejected save %s", async (status) => {
    mocks.rpc.mockResolvedValue({ data: { status }, error: null });
    expect((await saveResourceDraftAction(previous, form())).status).toBe("error");
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it.each(["unauthenticated", "owner_missing", "owner_not_eligible"])("routes %s to authoritative auth resolution", async (status) => {
    mocks.rpc.mockResolvedValue({ data: { status }, error: null });
    await expect(saveResourceDraftAction(previous, form())).rejects.toThrow("redirect:/login");
    expect(mocks.pending).not.toHaveBeenCalled();
  });
  it("does not scan or retry a save when final Owner navigation cannot be verified", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "owner_not_eligible" }, error: null });
    mocks.destination.mockResolvedValue(null);
    await expect(saveResourceDraftAction(previous, form())).rejects.toThrow("could not be verified");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
  it.each([
    null, { status: "success" }, { ...acknowledgment().data, resource_draft: null },
    { ...acknowledgment().data, resource_draft: { ...acknowledgment().data.resource_draft, title: "Different" } },
    { ...acknowledgment().data, resource_draft: { ...acknowledgment().data.resource_draft, revision: 3 } },
  ])("rejects malformed or mismatched acknowledgment", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect((await saveResourceDraftAction(previous, form())).status).toBe("error");
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not scan database failures", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    expect((await saveResourceDraftAction(previous, form())).status).toBe("error");
    expect(mocks.pending).not.toHaveBeenCalled();
  });
});
