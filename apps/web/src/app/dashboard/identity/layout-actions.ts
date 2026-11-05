"use server";
import { revalidatePath } from "next/cache";
import { createProfileEditorClient } from "@/lib/workspace/profile-editor-server";
import { createOwnerLayoutWorkingSave, ownerLayoutWorkingSaveIntentSchema } from "@/lib/workspace/owner-layout-working-save";
export type LayoutSaveState = {
  status: "idle" | "saved" | "error" | "reload";
  message: string | null;
  revision: number | null;
};
export async function saveLayoutWorkingAction(_previous: LayoutSaveState, form: FormData): Promise<LayoutSaveState> {
  const rawRevision = form.get("layoutRevision");
  const validRevision = typeof rawRevision === "string" && /^[1-9][0-9]{0,15}$/.test(rawRevision);
  const intent = ownerLayoutWorkingSaveIntentSchema.safeParse({
    action: "save_layout_working", base_layout_revision: validRevision ? Number(rawRevision) : null,
    starter_key: form.get("starterKey"),
  });
  if (!intent.success || Array.from(form.keys()).some(key => !key.startsWith("$ACTION_") && !["layoutRevision", "starterKey"].includes(key))
    || ["layoutRevision", "starterKey"].some(key => form.getAll(key).length !== 1))
    return { status: "error", message: "Choose a starting style and reload the saved revision if needed.", revision: null };
  try {
    const result = await createOwnerLayoutWorkingSave(await createProfileEditorClient()).save(intent.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: result.changed ? "Starting style saved in Working. Your published Identity has not changed." : "This starting style is already saved in Working.", revision: result.layout_working.revision };
    }
  } catch { /* No retry or inferred rollback after uncertain dispatch. */ }
  return { status: "reload", message: "We couldn’t confirm the style save. Keep your choice and reload saved work before saving again.", revision: null };
}
