import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth/owner-state", () => ({ resolveCurrentOwnerState: mocks.owner }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/app/auth/sign-out/sign-out-form", () => ({ SignOutForm: () => null }));
import AccountStatusPage from "./page";
describe("private account-level notice", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); }); });
  it.each(["restricted", "suspended"])("shows only authoritative %s status without inferred case reasons", async (status) => {
    mocks.owner.mockResolvedValue({ status, ownerId: "private-owner-uuid" });
    const html = renderToStaticMarkup(await AccountStatusPage());
    expect(html).toContain(status); expect(html).toContain("does not delete your saved work");
    expect(html).not.toContain("private-owner-uuid"); expect(html).not.toContain("Appeal available");
  });
  it.each([["unauthenticated","/login"],["onboarding_incomplete","/onboarding"],["active","/dashboard"]])("routes %s to its current destination", async (status,path) => {
    mocks.owner.mockResolvedValue({ status });
    await expect(AccountStatusPage()).rejects.toThrow(`redirect:${path}`);
  });
  it("fails closed when Owner cannot be resolved", async () => {
    mocks.owner.mockResolvedValue({ status: "owner_missing" });
    await expect(AccountStatusPage()).rejects.toThrow("could not be verified");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
