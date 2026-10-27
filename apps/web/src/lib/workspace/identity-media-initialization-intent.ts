import "server-only";
import { z } from "zod";
import { identityMediaAdditionIntentSchema } from "./identity-media-addition-intent";
import { inspectIdentityMediaWorkingInput, type IdentityMediaWorkingIssue } from "./identity-media-working-input";

export const identityMediaInitializationIntentSchema = identityMediaAdditionIntentSchema.extend({
  action: z.literal("initialize_media_block"),
  base_collection_revision: z.null(),
});
export type IdentityMediaInitializationIntent = z.infer<typeof identityMediaInitializationIntentSchema>;
export type IdentityMediaInitializationIntentResult = { status: "invalid_initialization_intent" }
  | { status: "intent"; data: IdentityMediaInitializationIntent; issues: IdentityMediaWorkingIssue[] };

/** Local expected-absence intent only; no creation, absence proof or authorization. */
export function inspectIdentityMediaInitializationIntent(value: unknown): IdentityMediaInitializationIntentResult {
  const parsed = identityMediaInitializationIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_initialization_intent" };
  const working = inspectIdentityMediaWorkingInput(parsed.data.media_working);
  if (working.status !== "working") return { status: "invalid_initialization_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
