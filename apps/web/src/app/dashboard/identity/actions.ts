"use server";
import { revalidatePath } from "next/cache";
import { ownerProfileTextWorkingSaveIntentSchema, createOwnerProfileTextWorkingSave } from "@/lib/workspace/owner-profile-text-working-save";
import { createProfileEditorClient } from "@/lib/workspace/profile-editor-server";
export type ProfileSaveState = { status: "idle" | "saved" | "error" | "reload"; message: string | null; textRevision: number | null };
export async function saveProfileWorkingAction(_previous: ProfileSaveState, form: FormData): Promise<ProfileSaveState> {
  const revision = (name: string) => { const value = form.get(name); return typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null; };
  const value = { action: "save_profile_text_working", base_profile_revision: revision("profileRevision"),
    base_text_revision: revision("textRevision"), profile_text_working: { display_name: form.get("displayName"), bio: form.get("bio") } };
  const parsed = ownerProfileTextWorkingSaveIntentSchema.safeParse(value);
  if (!parsed.success || typeof form.get("displayName") !== "string" || typeof form.get("bio") !== "string" || typeof form.get("textRevision") !== "string" || (form.get("textRevision") !== "" && revision("textRevision") === null) || Array.from(form.keys()).some(key => !key.startsWith("$ACTION_") && !["profileRevision","textRevision","displayName","bio"].includes(key)))
    return { status: "error", message: "These changes could not be saved. Check the field sizes and reload if needed.", textRevision: revision("textRevision") };
  try {
    const result = await createOwnerProfileTextWorkingSave(await createProfileEditorClient()).save(parsed.data);
    if (result.status === "success") { revalidatePath("/dashboard/identity"); return { status: "saved", message: "Working saved. Your published Identity has not changed.", textRevision: result.text_revision }; }
    return { status: "reload", message: "We couldn’t confirm this save. Keep your text and reload the latest saved work before saving again.", textRevision: null };
  } catch { return { status: "reload", message: "Your saved work is temporarily unavailable. Keep your text and reload before saving again.", textRevision: null }; }
}
