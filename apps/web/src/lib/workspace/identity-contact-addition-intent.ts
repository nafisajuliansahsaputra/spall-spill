import "server-only";
import { z } from "zod";
import { identityContactWorkingInputSchema, inspectIdentityContactWorkingInput,
  type IdentityContactWorkingIssue } from "./identity-contact-working-input";

export const identityContactAdditionIntentSchema = z.object({
  action: z.literal("add_contact_block"),
  base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  is_visible: z.boolean(),
  contact_working: identityContactWorkingInputSchema,
}).strict();
export type IdentityContactAdditionIntent = z.infer<typeof identityContactAdditionIntentSchema>;
export type IdentityContactAdditionIntentResult = { status: "invalid_add_intent" }
  | { status: "intent"; data: IdentityContactAdditionIntent; issues: IdentityContactWorkingIssue[] };

/** Local intent only; no allocation, ownership, CAS or persistence acknowledgment. */
export function inspectIdentityContactAdditionIntent(value: unknown): IdentityContactAdditionIntentResult {
  const parsed = identityContactAdditionIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_add_intent" };
  const working = inspectIdentityContactWorkingInput(parsed.data.contact_working);
  if (working.status !== "working") return { status: "invalid_add_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
