import "server-only";
import { z } from "zod";
import { identityTextWorkingInputSchema, inspectIdentityTextWorkingInput,
  type IdentityTextWorkingIssue } from "./identity-text-working-input";

export const identityTextAdditionIntentSchema = z.object({
  action: z.literal("add_text_block"),
  base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  is_visible: z.boolean(),
  text_working: identityTextWorkingInputSchema,
}).strict();
export type IdentityTextAdditionIntent = z.infer<typeof identityTextAdditionIntentSchema>;
export type IdentityTextAdditionIntentResult = { status: "invalid_add_intent" }
  | { status: "intent"; data: IdentityTextAdditionIntent; issues: IdentityTextWorkingIssue[] };

/** Local intent only; no allocation, ownership, CAS or persistence acknowledgment. */
export function inspectIdentityTextAdditionIntent(value: unknown): IdentityTextAdditionIntentResult {
  const parsed = identityTextAdditionIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_add_intent" };
  const working = inspectIdentityTextWorkingInput(parsed.data.text_working);
  if (working.status !== "working") return { status: "invalid_add_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
