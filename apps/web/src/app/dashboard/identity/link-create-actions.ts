"use server";
import { revalidatePath } from "next/cache";
import { createProfileEditorClient } from "@/lib/workspace/profile-editor-server";
import { identityLinkInitializationIntentSchema } from "@/lib/workspace/identity-link-initialization-intent";
import { identityLinkAdditionIntentSchema } from "@/lib/workspace/identity-link-addition-intent";
import { createOwnerFirstLinkInitialization } from "@/lib/workspace/owner-first-link-initialization";
import { createOwnerLinkBlockAllocation } from "@/lib/workspace/owner-link-block-allocation";
import type { LinkSaveState } from "./link-actions";
export async function createLinkWorkingAction(_previous: LinkSaveState, form: FormData): Promise<LinkSaveState> {
  const fields = ["collectionRevision", "kind", "title", "platform", "destination", "visibility"];
  const invalid: LinkSaveState = { status: "error", message: "Check the link fields and Working visibility before adding it.", revision: null };
  if (fields.some(key => form.getAll(key).length !== 1 || typeof form.get(key) !== "string")
    || Array.from(form.keys()).some(key => !key.startsWith("$ACTION_") && !fields.includes(key))) return invalid;
  const raw = form.get("collectionRevision") as string;
  if (raw !== "" && !/^[1-9][0-9]{0,15}$/.test(raw)) return invalid;
  if (!["true", "false"].includes(form.get("visibility") as string)) return invalid;
  const first = raw === "";
  const intent = { action: first ? "initialize_link_block" : "add_link_block", base_collection_revision: first ? null : Number(raw),
    is_visible: form.get("visibility") === "true", link_working: { kind: form.get("kind"), title: form.get("title"),
      social_platform: form.get("kind") === "generic_link" && form.get("platform") === "" ? null : form.get("platform"), destination_url: form.get("destination") } };
  const parsed = first ? identityLinkInitializationIntentSchema.safeParse(intent) : identityLinkAdditionIntentSchema.safeParse(intent);
  if (!parsed.success) return invalid;
  try {
    const client = await createProfileEditorClient();
    const result = first ? await createOwnerFirstLinkInitialization(client).initialize(parsed.data) : await createOwnerLinkBlockAllocation(client).add(parsed.data);
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Link block added to Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
  } catch { /* Unknown allocation must be reconciled; never recreate automatically. */ }
  return { status: "reload", message: "We couldn’t confirm the new link. Keep your text and reload saved links before adding or saving again.", revision: null };
}
