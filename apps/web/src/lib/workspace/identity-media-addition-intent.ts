import "server-only";
import { z } from "zod";
import { identityMediaWorkingInputSchema, inspectIdentityMediaWorkingInput,
  type IdentityMediaWorkingIssue } from "./identity-media-working-input";

export const identityMediaAdditionIntentSchema = z.object({
  action: z.literal("add_media_block"),
  base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  is_visible: z.boolean(),
  media_working: identityMediaWorkingInputSchema,
}).strict();
export type IdentityMediaAdditionIntent = z.infer<typeof identityMediaAdditionIntentSchema>;
export type IdentityMediaAdditionIntentResult = { status: "invalid_add_intent" }
  | { status: "intent"; data: IdentityMediaAdditionIntent; issues: IdentityMediaWorkingIssue[] };

/** Local intent only; no allocation, ownership, CAS or persistence acknowledgment. */
export function inspectIdentityMediaAdditionIntent(value: unknown): IdentityMediaAdditionIntentResult {
  const parsed = identityMediaAdditionIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_add_intent" };
  const working = inspectIdentityMediaWorkingInput(parsed.data.media_working);
  if (working.status !== "working") return { status: "invalid_add_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
