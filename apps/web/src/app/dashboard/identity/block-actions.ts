"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createBlockControlsClient } from "@/lib/workspace/profile-editor-server";
import { createOwnerBlockVisibilityWorkingSave } from "@/lib/workspace/owner-block-visibility-working-save";
import { createOwnerBlockWorkingMove } from "@/lib/workspace/owner-block-working-move";
import { createOwnerBlockWorkingRemoval } from "@/lib/workspace/owner-block-working-removal";
export type BlockControlState = { status: "idle" | "saved" | "error" | "reload"; message: string | null; revision: number | null };
const request = z.object({ blockId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  collectionRevision: z.string().regex(/^[1-9][0-9]{0,15}$/).transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
  operation: z.enum(["show", "hide", "up", "down", "remove"]) }).strict();
export async function changeBlockWorkingAction(_previous: BlockControlState, form: FormData): Promise<BlockControlState> {
  const invalid: BlockControlState = { status: "error", message: "Check the saved block and confirm removal when needed.", revision: null };
  const fields = ["blockId", "collectionRevision", "operation"];
  const removing = form.get("operation") === "remove";
  const allowed = removing ? [...fields, "confirmRemoval"] : fields;
  if (allowed.some(key => form.getAll(key).length !== 1 || typeof form.get(key) !== "string")
    || Array.from(form.keys()).some(key => !key.startsWith("$ACTION_") && !allowed.includes(key))
    || (removing && form.get("confirmRemoval") !== "true")) return invalid;
  const parsed = request.safeParse(Object.fromEntries(fields.map(key => [key, form.get(key)])));
  if (!parsed.success) return invalid;
  const { blockId, collectionRevision, operation } = parsed.data;
  const base = { block_id: blockId, base_collection_revision: collectionRevision };
  try {
    const client = await createBlockControlsClient();
    const result = operation === "remove" ? await createOwnerBlockWorkingRemoval(client).remove({ ...base, confirm_removal: true })
      : operation === "show" || operation === "hide" ? await createOwnerBlockVisibilityWorkingSave(client).save({ ...base, is_visible: operation === "show" })
        : await createOwnerBlockWorkingMove(client).move({ ...base, direction: operation });
    if (result.status === "success") {
      revalidatePath("/dashboard/identity");
      return { status: "saved", message: "Block composition saved in Working. Your published Identity has not changed.", revision: result.collection_revision };
    }
    if (result.status === "move_not_available") return { status: "error", message: "This block is already at that edge. No order change was saved.", revision: null };
  } catch { /* A missing reply never proves rollback. */ }
  return { status: "reload", message: "We couldn’t confirm this block change. Reload saved work before changing the composition again.", revision: null };
}
