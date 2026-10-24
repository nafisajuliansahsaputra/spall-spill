import "server-only";
import { z } from "zod";
import { identityContactAdditionIntentSchema } from "./identity-contact-addition-intent";
import { identityContactSaveIntentSchema } from "./identity-contact-save-intent";
import { identityContactInitializationIntentSchema } from "./identity-contact-initialization-intent";

/** Explicit local command only. Save dispatch must remove this facade action. */
export const identityContactEditorCommandSchema = z.discriminatedUnion("action", [
  identityContactAdditionIntentSchema,
  identityContactSaveIntentSchema.extend({ action: z.literal("save_contact_block") }).strict(),
  identityContactInitializationIntentSchema,
]);
export type IdentityContactEditorCommand = z.infer<typeof identityContactEditorCommandSchema>;
