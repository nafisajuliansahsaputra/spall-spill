import "server-only";
import { z } from "zod";
import { ownerTextBlockWorkingRequestSchema } from "./owner-text-block-working";
import { identityTextWorkingInputSchema, inspectIdentityTextWorkingInput,
  type IdentityTextWorkingIssue } from "./identity-text-working-input";

export const identityTextSaveIntentSchema = ownerTextBlockWorkingRequestSchema.extend({
  base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  text_working: identityTextWorkingInputSchema,
}).strict();
export type IdentityTextSaveIntent = z.infer<typeof identityTextSaveIntentSchema>;
export type IdentityTextSaveIntentResult = { status: "invalid_save_intent" }
  | { status: "intent"; data: IdentityTextSaveIntent; issues: IdentityTextWorkingIssue[] };

/** Local existing-block intent only; no ownership, CAS, repair or save acknowledgment. */
export function inspectIdentityTextSaveIntent(value: unknown): IdentityTextSaveIntentResult {
  const parsed = identityTextSaveIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_save_intent" };
  const working = inspectIdentityTextWorkingInput(parsed.data.text_working);
  if (working.status !== "working") return { status: "invalid_save_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
