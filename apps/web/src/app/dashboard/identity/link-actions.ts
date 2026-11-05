"use server";
import { revalidatePath } from "next/cache";
import { createProfileEditorClient } from "@/lib/workspace/profile-editor-server";
import { createOwnerBlockLinkWorkingSave, ownerBlockLinkWorkingSaveIntentSchema } from "@/lib/workspace/owner-block-link-working-save";
export type LinkSaveState = { status: "idle" | "saved" | "error" | "reload"; message: string | null; revision: number | null };
export async function saveLinkWorkingAction(_previous: LinkSaveState, form: FormData): Promise<LinkSaveState> {
  const fields = ["blockId", "collectionRevision", "kind", "title", "platform", "destination"];
  const invalid: LinkSaveState = { status: "error", message: "Check the field sizes and saved block before trying again.", revision: null };
  if (fields.some(key => form.getAll(key).length !== 1 || typeof form.get(key) !== "string")
    || Array.from(form.keys()).some(key => !key.startsWith("$ACTION_") && !fields.includes(key))) return invalid;
  const rawRevision = form.get("collectionRevision") as string;
  const intent = ownerBlockLinkWorkingSaveIntentSchema.safeParse({ block_id: form.get("blockId"),
    base_collection_revision: /^[1-9][0-9]{0,15}$/.test(rawRevision) ? Number(rawRevision) : null,
    link_working: { kind: form.get("kind"), title: form.get("title"), destination_url: form.get("destination"),
      social_platform: form.get("kind") === "generic_link" && form.get("platform") === "" ? null : form.get("platform") } });
  if (!intent.success) return invalid;
  try {
    const result = await createOwnerBlockLinkWorkingSave(await createProfileEditorClient()).save(intent.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Link saved in Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
  } catch { /* Reconcile uncertain state; never retry a dispatched mutation. */ }
  return { status: "reload", message: "We couldn’t confirm the link save. Keep your edits and reload saved work before saving any links again.", revision: null };
}
