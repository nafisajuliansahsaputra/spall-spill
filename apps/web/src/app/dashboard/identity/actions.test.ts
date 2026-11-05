import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/workspace/profile-editor-server", () => ({ createProfileEditorClient: mocks.client }));
vi.mock("@/lib/workspace/owner-profile-text-working-save", async importActual => ({
  ...await importActual<typeof import("@/lib/workspace/owner-profile-text-working-save")>(),
  createOwnerProfileTextWorkingSave: () => ({ save: mocks.save }),
}));
import { saveProfileWorkingAction } from "./actions";
const previous = { status: "idle" as const, message: null, textRevision: null };
function form() {
  const data = new FormData(); data.set("profileRevision", "2"); data.set("textRevision", "");
  data.set("displayName", ""); data.set("bio", " Raw\r\n Bio "); return data;
}
beforeEach(() => { vi.clearAllMocks(); mocks.client.mockResolvedValue({}); mocks.save.mockResolvedValue({ status: "success", text_revision: 1, source_profile_revision: 2 }); });
it("saves exact unfinished raw text without a Published action or caller Owner target", async () => {
  expect(await saveProfileWorkingAction(previous, form())).toEqual({ status: "saved", message: "Working saved. Your published Identity has not changed.", textRevision: 1 });
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ action: "save_profile_text_working", base_profile_revision: 2, base_text_revision: null, profile_text_working: { display_name: "", bio: " Raw\r\n Bio " } });
});
it.each(["owner_id", "subject", "action", "published"])("rejects extra authority %s before any session or DB I/O", async key => {
  const data = form(); data.set(key, "forged"); expect((await saveProfileWorkingAction(previous, data)).status).toBe("error"); expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["displayName", "bio", "textRevision", "profileRevision"])("rejects missing %s without mutation", async key => {
  const data = form(); data.delete(key); expect((await saveProfileWorkingAction(previous, data)).status).toBe("error"); expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["bad", "0", "-1", "1.5", "9007199254740992"])("rejects invalid nullable text CAS %s", async value => {
  const data = form(); data.set("textRevision", value); expect((await saveProfileWorkingAction(previous, data)).status).toBe("error"); expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["stale_write", "stale_source", "outcome_unknown", "restricted", "unavailable"])("requires reconciliation after %s without retry", async status => {
  mocks.save.mockResolvedValue({ status }); expect((await saveProfileWorkingAction(previous, form())).status).toBe("reload"); expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("fails closed when no verified session/credential is available", async () => {
  mocks.client.mockRejectedValue(new Error("private provider detail")); const result = await saveProfileWorkingAction(previous, form());
  expect(result.status).toBe("reload"); expect(result.message).not.toContain("private provider detail"); expect(mocks.save).not.toHaveBeenCalled();
});
