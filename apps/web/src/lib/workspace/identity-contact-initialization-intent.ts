import "server-only";
import { z } from "zod";
import { identityContactAdditionIntentSchema } from "./identity-contact-addition-intent";
import { inspectIdentityContactWorkingInput, type IdentityContactWorkingIssue } from "./identity-contact-working-input";

export const identityContactInitializationIntentSchema = identityContactAdditionIntentSchema.extend({
  action: z.literal("initialize_contact_block"),
  base_collection_revision: z.null(),
});
export type IdentityContactInitializationIntent = z.infer<typeof identityContactInitializationIntentSchema>;
export type IdentityContactInitializationIntentResult = { status: "invalid_initialization_intent" }
  | { status: "intent"; data: IdentityContactInitializationIntent; issues: IdentityContactWorkingIssue[] };

/** Local expected-absence intent only; no creation, absence proof or authorization. */
export function inspectIdentityContactInitializationIntent(value: unknown): IdentityContactInitializationIntentResult {
  const parsed = identityContactInitializationIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_initialization_intent" };
  const working = inspectIdentityContactWorkingInput(parsed.data.contact_working);
  if (working.status !== "working") return { status: "invalid_initialization_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
