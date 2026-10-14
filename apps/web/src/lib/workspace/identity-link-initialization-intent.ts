import "server-only";
import { z } from "zod";
import { identityLinkAdditionIntentSchema } from "./identity-link-addition-intent";
import { inspectIdentityLinkWorkingInput, type IdentityLinkWorkingIssue } from "./identity-link-working-input";

export const identityLinkInitializationIntentSchema = identityLinkAdditionIntentSchema.extend({
  action: z.literal("initialize_link_block"),
  base_collection_revision: z.null(),
});
export type IdentityLinkInitializationIntent = z.infer<typeof identityLinkInitializationIntentSchema>;
export type IdentityLinkInitializationIntentResult = { status: "invalid_initialization_intent" }
  | { status: "intent"; data: IdentityLinkInitializationIntent; issues: IdentityLinkWorkingIssue[] };

/** Local expected-absence intent only; no creation, absence proof or authorization. */
export function inspectIdentityLinkInitializationIntent(value: unknown): IdentityLinkInitializationIntentResult {
  const parsed = identityLinkInitializationIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_initialization_intent" };
  const working = inspectIdentityLinkWorkingInput(parsed.data.link_working);
  if (working.status !== "working") return { status: "invalid_initialization_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
