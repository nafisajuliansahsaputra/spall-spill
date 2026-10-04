import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), clear: vi.fn(), consume: vi.fn() }));
vi.mock("./owner-state", () => ({ resolveCurrentOwnerState: mocks.owner }));
vi.mock("./intended-destination-cookie", () => ({ clearIntendedDestinationCookie: mocks.clear, consumeIntendedDestinationCookie: mocks.consume }));
import { resolveCurrentOwnerDestination } from "./resolved-destination";
describe("shared authoritative auth destination", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.clear.mockResolvedValue(undefined); mocks.consume.mockResolvedValue(null); });
  it.each([
    ["unauthenticated", "/login", false], ["owner_missing", null, true],
    ["restricted", "/dashboard/account-status", true], ["suspended", "/dashboard/account-status", true],
    ["onboarding_incomplete", "/onboarding", true], ["active", "/dashboard", false],
  ])("routes %s to the final page", async (status, destination, clear) => {
    mocks.owner.mockResolvedValue({ status });
    expect(await resolveCurrentOwnerDestination()).toBe(destination);
    expect(mocks.clear).toHaveBeenCalledTimes(clear ? 1 : 0);
    expect(mocks.consume).toHaveBeenCalledTimes(status === "active" ? 1 : 0);
  });
  it("restores sanitized destination only for active Owner", async () => {
    mocks.owner.mockResolvedValue({ status: "active" }); mocks.consume.mockResolvedValue("/dashboard/items");
    expect(await resolveCurrentOwnerDestination()).toBe("/dashboard/items");
  });
  it("fails closed on authoritative read failures", async () => {
    mocks.owner.mockRejectedValue(new Error("unavailable"));
    expect(await resolveCurrentOwnerDestination()).toBeNull();
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
