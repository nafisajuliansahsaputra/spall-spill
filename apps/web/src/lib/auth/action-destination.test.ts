import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), redirect: vi.fn() }));
vi.mock("./resolved-destination", () => ({ resolveCurrentOwnerDestination: mocks.resolve }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { redirectToCurrentOwnerDestination } from "./action-destination";
describe("Server Action authoritative final destination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); });
  });
  it.each(["/login", "/onboarding", "/dashboard", "/dashboard/account-status", "/dashboard/items"])(
    "navigates directly to %s without an intermediate handler", async (destination) => {
      mocks.resolve.mockResolvedValue(destination);
      await expect(redirectToCurrentOwnerDestination()).rejects.toThrow(`redirect:${destination}`);
      expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(destination);
    },
  );
  it("does not guess a destination when authoritative resolution fails", async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(redirectToCurrentOwnerDestination()).rejects.toThrow("could not be verified");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
