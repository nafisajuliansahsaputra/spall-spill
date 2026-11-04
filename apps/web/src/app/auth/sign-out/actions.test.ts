import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), signOut: vi.fn(), commit: vi.fn(), clear: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSessionExitContext: mocks.client }));
vi.mock("@/lib/auth/intended-destination-cookie", () => ({ clearIntendedDestinationCookie: mocks.clear }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { signOutAction } from "./actions";
describe("explicit current-session Sign Out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockResolvedValue({ client: { auth: { signOut: mocks.signOut } }, commitCookieChanges: mocks.commit });
    mocks.signOut.mockResolvedValue({ error: null }); mocks.clear.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); });
  });
  it("revokes only current context, clears intent after provider acknowledgment and navigates directly", async () => {
    await expect(signOutAction()).rejects.toThrow("redirect:/login");
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.commit.mock.invocationCallOrder[0]!);
    expect(mocks.commit.mock.invocationCallOrder[0]).toBeLessThan(mocks.clear.mock.invocationCallOrder[0]!);
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]!);
  });
  it("does not clear intent or claim logout on provider failure", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "unavailable" } });
    expect((await signOutAction()).status).toBe("error");
    expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.clear).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("returns retryable failure on transport error", async () => {
    mocks.signOut.mockRejectedValue(new Error("network"));
    expect((await signOutAction()).status).toBe("error"); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not swallow Next redirect into a failed logout result", async () => {
    await expect(signOutAction()).rejects.toThrow("redirect:/login");
  });
});
