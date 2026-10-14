import "server-only";
import { z } from "zod";
import { identityLinkWorkingInputSchema, inspectIdentityLinkWorkingInput,
  type IdentityLinkWorkingIssue } from "./identity-link-working-input";

export const identityLinkAdditionIntentSchema = z.object({
  action: z.literal("add_link_block"),
  base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  is_visible: z.boolean(),
  link_working: identityLinkWorkingInputSchema,
}).strict();
export type IdentityLinkAdditionIntent = z.infer<typeof identityLinkAdditionIntentSchema>;
export type IdentityLinkAdditionIntentResult = { status: "invalid_add_intent" }
  | { status: "intent"; data: IdentityLinkAdditionIntent; issues: IdentityLinkWorkingIssue[] };

/** Local intent only; no allocation, ownership, CAS or persistence acknowledgment. */
export function inspectIdentityLinkAdditionIntent(value: unknown): IdentityLinkAdditionIntentResult {
  const parsed = identityLinkAdditionIntentSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_add_intent" };
  const working = inspectIdentityLinkWorkingInput(parsed.data.link_working);
  if (working.status !== "working") return { status: "invalid_add_intent" };
  return { status: "intent", data: parsed.data, issues: working.issues };
}
