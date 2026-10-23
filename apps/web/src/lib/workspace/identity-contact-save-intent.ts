import "server-only";
import { z } from "zod";
import { ownerContactBlockWorkingRequestSchema } from "./owner-contact-block-working";
import { identityContactWorkingInputSchema, inspectIdentityContactWorkingInput,
  type IdentityContactWorkingIssue } from "./identity-contact-working-input";

export const identityContactSaveIntentSchema = ownerContactBlockWorkingRequestSchema.extend({
  base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  contact_working: identityContactWorkingInputSchema,
}).strict();
export type IdentityContactSaveIntent = z.infer<typeof identityContactSaveIntentSchema>;
export type IdentityContactSaveIntentResult = { status: "invalid_save_intent" }
  | { status: "intent"; data: IdentityContactSaveIntent; issues: IdentityContactWorkingIssue[] };

/** Local existing-block intent only; no ownership, CAS, repair or save acknowledgment. */
export function inspectIdentityContactSaveIntent(value: unknown): IdentityContactSaveIntentResult {
  const parsed = identityContactSaveIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_save_intent" };
  const working = inspectIdentityContactWorkingInput(parsed.data.contact_working);
  if (working.status !== "working") return { status: "invalid_save_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
