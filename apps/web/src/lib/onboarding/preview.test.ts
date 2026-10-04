import { beforeEach, describe, expect, it, vi } from "vitest";
import { onboardingPreviewFixture } from "@/test/onboarding-preview-fixture";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getClaims: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { resolveCurrentOnboardingPreview } from "./preview";
describe("authoritative private onboarding preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getClaims: mocks.getClaims }, schema: () => ({ rpc: mocks.rpc }) });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: "77000000-0000-4000-8000-000000000001" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: onboardingPreviewFixture(), error: null });
  });
  it("requests one current-Owner coherent read without selecting Owner", async () => {
    expect(await resolveCurrentOnboardingPreview()).toEqual(onboardingPreviewFixture());
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("resolve_current_onboarding_preview");
  });
  it("does not call database with unverified claims", async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error("unauthenticated") });
    expect(await resolveCurrentOnboardingPreview()).toEqual({ status: "unauthenticated" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([
    null, { status: "success" }, { status: "unauthenticated" },
    { ...onboardingPreviewFixture(), current_step: "relevant_first_job" },
    { ...onboardingPreviewFixture(), snapshot_hash: "invalid" },
    { ...onboardingPreviewFixture(), owner_id: "foreign" },
    { ...onboardingPreviewFixture(), progress_revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...onboardingPreviewFixture(), identity_validation_issues: ["connection_not_safe"] },
    { ...onboardingPreviewFixture(), product_draft: {
      spill_reference: 1, title: "Unsafe source", source_url: "https://example.test/product", revision: 1,
      safety: { status: "pending", revision: null, expires_at: null }, validation_issues: [],
    } },
  ])("fails closed on malformed or inconsistent preview: %j", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(resolveCurrentOnboardingPreview()).rejects.toThrow();
  });
  it("reports transport failure instead of synthesizing preview", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("unavailable") });
    await expect(resolveCurrentOnboardingPreview()).rejects.toThrow();
  });
  it("requires Product preparation issue even when title and source are safe", async () => {
    const preview = onboardingPreviewFixture();
    preview.product_draft = { title: "Product title", source_url: "https://example.test/product", revision: 1, spill_reference: 1,
      safety: { status: "safe", revision: 1, expires_at: new Date(Date.now()+60_000).toISOString() },
      validation_issues: ["product_publication_preparation_pending"] };
    mocks.rpc.mockResolvedValue({ data: preview, error: null });
    expect(await resolveCurrentOnboardingPreview()).toEqual(preview);
    preview.product_draft.validation_issues = [];
    await expect(resolveCurrentOnboardingPreview()).rejects.toThrow();
  });
  it.each(["owner_missing", "owner_unavailable", "onboarding_complete", "progress_missing"])("retains routing truth for %s", async (status) => {
    mocks.rpc.mockResolvedValue({ data: { status }, error: null });
    expect(await resolveCurrentOnboardingPreview()).toEqual({ status });
  });
});
