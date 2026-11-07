"use server";
import { revalidatePath } from "next/cache";
import { createContactEditorClient } from "@/lib/workspace/profile-editor-server";
import { identityContactInitializationIntentSchema } from "@/lib/workspace/identity-contact-initialization-intent";
import { identityContactAdditionIntentSchema } from "@/lib/workspace/identity-contact-addition-intent";
import { identityContactSaveIntentSchema } from "@/lib/workspace/identity-contact-save-intent";
import { createOwnerFirstContactInitialization } from "@/lib/workspace/owner-first-contact-initialization";
import { createOwnerContactBlockAllocation } from "@/lib/workspace/owner-contact-block-allocation";
import { createOwnerBlockContactWorkingSave } from "@/lib/workspace/owner-block-contact-working-save";
export type ContactSaveState = { status: "idle" | "saved" | "error" | "reload"; message: string | null; revision: number | null };
function exact(form: FormData, fields: string[]) {
  return fields.every(key => form.getAll(key).length === 1 && typeof form.get(key) === "string")
    && Array.from(form.keys()).every(key => key.startsWith("$ACTION_") || fields.includes(key));
}
const invalid: ContactSaveState = { status: "error", message: "Check the saved revision and Contact fields before trying again.", revision: null };
const reload: ContactSaveState = { status: "reload", message: "We couldn’t confirm this Contact change. Keep your details and reload saved work before trying again.", revision: null };
export async function createContactWorkingAction(_previous: ContactSaveState, form: FormData): Promise<ContactSaveState> {
  if (!exact(form, ["collectionRevision", "contactType", "label", "value", "visibility"])) return invalid;
  const raw = form.get("collectionRevision") as string;
  if ((raw !== "" && !/^[1-9][0-9]{0,15}$/.test(raw)) || !["true", "false"].includes(form.get("visibility") as string)) return invalid;
  const first = raw === "";
  const input = { action: first ? "initialize_contact_block" : "add_contact_block", base_collection_revision: first ? null : Number(raw),
    is_visible: form.get("visibility") === "true", contact_working: { kind: "contact", contact_type: form.get("contactType") === "" ? null : form.get("contactType"), label: form.get("label"), value: form.get("value") } };
  const parsed = first ? identityContactInitializationIntentSchema.safeParse(input) : identityContactAdditionIntentSchema.safeParse(input);
  if (!parsed.success) return invalid;
  try {
    const client = await createContactEditorClient();
    const result = first ? await createOwnerFirstContactInitialization(client).initialize(parsed.data) : await createOwnerContactBlockAllocation(client).add(parsed.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Contact block added to Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
  } catch { /* A dispatched allocation may have committed; reconcile instead of replaying. */ }
  return reload;
}
export async function saveContactWorkingAction(_previous: ContactSaveState, form: FormData): Promise<ContactSaveState> {
  if (!exact(form, ["blockId", "collectionRevision", "contactType", "label", "value"])) return invalid;
  const raw = form.get("collectionRevision") as string;
  if (!/^[1-9][0-9]{0,15}$/.test(raw)) return invalid;
  const parsed = identityContactSaveIntentSchema.safeParse({ block_id: form.get("blockId"), base_collection_revision: Number(raw), contact_working: { kind: "contact", contact_type: form.get("contactType") === "" ? null : form.get("contactType"), label: form.get("label"), value: form.get("value") } });
  if (!parsed.success) return invalid;
  try {
    const result = await createOwnerBlockContactWorkingSave(await createContactEditorClient()).save(parsed.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Contact saved in Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
  } catch { /* Never infer rollback from a missing acknowledgment. */ }
  return reload;
}
