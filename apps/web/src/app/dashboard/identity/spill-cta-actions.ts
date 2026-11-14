"use server";
import { revalidatePath } from "next/cache";
import { createSpillCtaEditorClient } from "@/lib/workspace/profile-editor-server";
import { identitySpillCtaInitializationIntentSchema, identitySpillCtaAdditionIntentSchema } from "@/lib/workspace/identity-spill-cta-working-command";
import { createOwnerFirstSpillCtaInitialization } from "@/lib/workspace/owner-first-spill-cta-initialization";
import { createOwnerSpillCtaBlockAllocation } from "@/lib/workspace/owner-spill-cta-block-allocation";
export type SpillCtaState = { status: "idle" | "saved" | "error" | "reload"; message: string | null; revision: number | null };
const invalid: SpillCtaState = { status: "error", message: "Check the saved revision and visibility before trying again.", revision: null };
export async function createSpillCtaWorkingAction(_previous: SpillCtaState, form: FormData): Promise<SpillCtaState> {
  const fields = ["collectionRevision", "visibility"];
  if (!fields.every(key => form.getAll(key).length === 1 && typeof form.get(key) === "string")
    || !Array.from(form.keys()).every(key => key.startsWith("$ACTION_") || fields.includes(key))) return invalid;
  const raw = form.get("collectionRevision") as string;
  if ((raw !== "" && !/^[1-9][0-9]{0,15}$/.test(raw)) || !["true", "false"].includes(form.get("visibility") as string)) return invalid;
  const first = raw === "";
  const input = { action: first ? "initialize_spill_cta_block" : "add_spill_cta_block", base_collection_revision: first ? null : Number(raw),
    is_visible: form.get("visibility") === "true", spill_cta_working: { kind: "spill_cta", target: "owner_spill" } };
  const parsed = first ? identitySpillCtaInitializationIntentSchema.safeParse(input) : identitySpillCtaAdditionIntentSchema.safeParse(input);
  if (!parsed.success) return invalid;
  try {
    const client = await createSpillCtaEditorClient();
    const result = first ? await createOwnerFirstSpillCtaInitialization(client).initialize(parsed.data) : await createOwnerSpillCtaBlockAllocation(client).add(parsed.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Spill integration added to Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
  } catch { /* An allocation may have committed. Require explicit authoritative readback. */ }
  return { status: "reload", message: "We couldn’t confirm this Spill integration. Reload saved work before trying again.", revision: null };
}
