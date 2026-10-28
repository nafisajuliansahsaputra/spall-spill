import "server-only";
import { z } from "zod";

export const identitySpillCtaWorkingInputSchema = z.object({
  kind: z.literal("spill_cta"), target: z.literal("owner_spill"),
}).strict();
const shared = { is_visible: z.boolean(), spill_cta_working: identitySpillCtaWorkingInputSchema };
export const identitySpillCtaAdditionIntentSchema = z.object({ ...shared,
  action: z.literal("add_spill_cta_block"), base_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict();
export const identitySpillCtaInitializationIntentSchema = z.object({ ...shared,
  action: z.literal("initialize_spill_cta_block"), base_collection_revision: z.null(),
}).strict();
export const identitySpillCtaWorkingCommandSchema = z.discriminatedUnion("action", [
  identitySpillCtaAdditionIntentSchema, identitySpillCtaInitializationIntentSchema,
]);
export type IdentitySpillCtaWorkingCommand = z.infer<typeof identitySpillCtaWorkingCommandSchema>;
