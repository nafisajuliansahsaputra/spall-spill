import "server-only";
import { z } from "zod";
import { ownerMediaBlockWorkingRequestSchema } from "./owner-media-block-working";
import { identityMediaWorkingInputSchema, inspectIdentityMediaWorkingInput,
  type IdentityMediaWorkingIssue } from "./identity-media-working-input";

export const identityMediaSaveIntentSchema = ownerMediaBlockWorkingRequestSchema.extend({
  base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  media_working: identityMediaWorkingInputSchema,
}).strict();
export type IdentityMediaSaveIntent = z.infer<typeof identityMediaSaveIntentSchema>;
export type IdentityMediaSaveIntentResult = { status: "invalid_save_intent" }
  | { status: "intent"; data: IdentityMediaSaveIntent; issues: IdentityMediaWorkingIssue[] };

/** Local existing-block intent only; no ownership, CAS, repair or save acknowledgment. */
export function inspectIdentityMediaSaveIntent(value: unknown): IdentityMediaSaveIntentResult {
  const parsed = identityMediaSaveIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_save_intent" };
  const working = inspectIdentityMediaWorkingInput(parsed.data.media_working);
  if (working.status !== "working") return { status: "invalid_save_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
