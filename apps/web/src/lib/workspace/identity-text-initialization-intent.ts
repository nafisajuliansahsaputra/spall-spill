import "server-only";
import { z } from "zod";
import { identityTextAdditionIntentSchema } from "./identity-text-addition-intent";
import { inspectIdentityTextWorkingInput, type IdentityTextWorkingIssue } from "./identity-text-working-input";

export const identityTextInitializationIntentSchema = identityTextAdditionIntentSchema.extend({
  action: z.literal("initialize_text_block"),
  base_collection_revision: z.null(),
});
export type IdentityTextInitializationIntent = z.infer<typeof identityTextInitializationIntentSchema>;
export type IdentityTextInitializationIntentResult = { status: "invalid_initialization_intent" }
  | { status: "intent"; data: IdentityTextInitializationIntent; issues: IdentityTextWorkingIssue[] };

/** Local expected-absence intent only; no creation, absence proof or authorization. */
export function inspectIdentityTextInitializationIntent(value: unknown): IdentityTextInitializationIntentResult {
  const parsed = identityTextInitializationIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_initialization_intent" };
  const working = inspectIdentityTextWorkingInput(parsed.data.text_working);
  if (working.status !== "working") return { status: "invalid_initialization_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
