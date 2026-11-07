"use server";
import { revalidatePath } from "next/cache";
import { createTextEditorClient } from "@/lib/workspace/profile-editor-server";
import { identityTextInitializationIntentSchema } from "@/lib/workspace/identity-text-initialization-intent";
import { identityTextAdditionIntentSchema } from "@/lib/workspace/identity-text-addition-intent";
import { identityTextSaveIntentSchema } from "@/lib/workspace/identity-text-save-intent";
import { createOwnerFirstTextInitialization } from "@/lib/workspace/owner-first-text-initialization";
import { createOwnerTextBlockAllocation } from "@/lib/workspace/owner-text-block-allocation";
import { createOwnerBlockTextWorkingSave } from "@/lib/workspace/owner-block-text-working-save";
export type TextSaveState = { status: "idle" | "saved" | "error" | "reload"; message: string | null; revision: number | null };
function exact(form: FormData, fields: string[]) {
  return fields.every(key => form.getAll(key).length === 1 && typeof form.get(key) === "string")
    && Array.from(form.keys()).every(key => key.startsWith("$ACTION_") || fields.includes(key));
}
const invalid: TextSaveState = { status: "error", message: "Check the saved revision and Text fields before trying again.", revision: null };
const reload: TextSaveState = { status: "reload", message: "We couldn’t confirm this Text change. Keep your text and reload saved work before trying again.", revision: null };
export async function createTextWorkingAction(_previous: TextSaveState, form: FormData): Promise<TextSaveState> {
  if (!exact(form, ["collectionRevision", "text", "visibility"])) return invalid;
  const raw = form.get("collectionRevision") as string;
  if ((raw !== "" && !/^[1-9][0-9]{0,15}$/.test(raw)) || !["true", "false"].includes(form.get("visibility") as string)) return invalid;
  const first = raw === "";
  const input = { action: first ? "initialize_text_block" : "add_text_block", base_collection_revision: first ? null : Number(raw),
    is_visible: form.get("visibility") === "true", text_working: { kind: "text", text: form.get("text") } };
  const parsed = first ? identityTextInitializationIntentSchema.safeParse(input) : identityTextAdditionIntentSchema.safeParse(input);
  if (!parsed.success) return invalid;
  try {
    const client = await createTextEditorClient();
    const result = first ? await createOwnerFirstTextInitialization(client).initialize(parsed.data) : await createOwnerTextBlockAllocation(client).add(parsed.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Text block added to Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
  } catch { /* A dispatched allocation may have committed; reconcile instead of replaying. */ }
  return reload;
}
export async function saveTextWorkingAction(_previous: TextSaveState, form: FormData): Promise<TextSaveState> {
  if (!exact(form, ["blockId", "collectionRevision", "text"])) return invalid;
  const raw = form.get("collectionRevision") as string;
  if (!/^[1-9][0-9]{0,15}$/.test(raw)) return invalid;
  const parsed = identityTextSaveIntentSchema.safeParse({ block_id: form.get("blockId"), base_collection_revision: Number(raw), text_working: { kind: "text", text: form.get("text") } });
  if (!parsed.success) return invalid;
  try {
    const result = await createOwnerBlockTextWorkingSave(await createTextEditorClient()).save(parsed.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Text saved in Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
  } catch { /* Never infer rollback from a missing acknowledgment. */ }
  return reload;
}
