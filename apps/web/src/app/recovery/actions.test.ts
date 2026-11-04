import { beforeEach, expect, it, vi } from "vitest";
import { initialRecoveryState } from "./state";
const mocks = vi.hoisted(() => ({ create: vi.fn(), request: vi.fn(), restore: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/recovery", async load => ({ ...await load<typeof import("@/lib/auth/recovery")>(),
  createRecoveryClient: mocks.create, requestRecovery: mocks.request, restoreRecovery: mocks.restore }));
import { requestRecoveryAction, restoreRecoveryAction } from "./actions";
const token = "a".repeat(64);
function form(values: Record<string, string>) { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
beforeEach(() => { mocks.create.mockReturnValue({ fixture: true }); mocks.restore.mockResolvedValue(true); mocks.redirect.mockImplementation(() => { throw new Error("redirect"); }); });
it("rejects malformed request locally and never echoes private input", async () => {
  const result = await requestRecoveryAction(initialRecoveryState, form({ email: "private-malformed" }));
  expect(result.status).toBe("error"); expect(JSON.stringify(result)).not.toContain("private-malformed"); expect(mocks.create).not.toHaveBeenCalled();
});
it("keeps provider outcomes privacy-safe, including failure", async () => {
  const data = form({ email: " owner@example.test " });
  const accepted = await requestRecoveryAction(initialRecoveryState, data); expect(accepted.status).toBe("requested");
  expect(mocks.request).toHaveBeenCalledWith({ fixture: true }, "owner@example.test");
  mocks.request.mockRejectedValue(new Error("account exists private"));
  const failed = await requestRecoveryAction(initialRecoveryState, data); expect(failed.message).toBe(accepted.message);
  expect(JSON.stringify(failed)).not.toContain("owner@example.test");
});
it.each([{ token_hash: "bad", password: "new-password", confirmation: "new-password" },
  { token_hash: token, password: "short", confirmation: "short" },
  { token_hash: token, password: "new-password", confirmation: "different" }])("requires fresh proof and matching password before SDK %#", async values => {
  const result = await restoreRecoveryAction(initialRecoveryState, form(values)); expect(result.status).toBe("error");
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.restore).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain(token); expect(JSON.stringify(result)).not.toContain("new-password");
});
it("uses a fixed login handoff, never a submitted redirect/Owner", async () => {
  await expect(restoreRecoveryAction(initialRecoveryState, form({ token_hash: token, password: "new-password", confirmation: "new-password", next: "https://evil.test", owner_id: "foreign" }))).rejects.toThrow("redirect");
  expect(mocks.restore).toHaveBeenCalledWith({ fixture: true }, token, "new-password");
  expect(mocks.redirect).toHaveBeenCalledWith("/login?notice=password_reset");
});
it("does not redirect on ambiguous/failed restoration", async () => {
  mocks.restore.mockResolvedValue(false);
  const result = await restoreRecoveryAction(initialRecoveryState, form({ token_hash: token, password: "new-password", confirmation: "new-password" }));
  expect(result.status).toBe("error"); expect(mocks.redirect).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain(token);
});
