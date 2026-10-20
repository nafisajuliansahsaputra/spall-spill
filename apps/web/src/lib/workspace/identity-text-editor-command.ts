import "server-only";
import { z } from "zod";
import { identityTextAdditionIntentSchema } from "./identity-text-addition-intent";
import { identityTextSaveIntentSchema } from "./identity-text-save-intent";
import { identityTextInitializationIntentSchema } from "./identity-text-initialization-intent";

/** Explicit local command only. Save dispatch must remove this facade action. */
export const identityTextEditorCommandSchema = z.discriminatedUnion("action", [
  identityTextAdditionIntentSchema,
  identityTextSaveIntentSchema.extend({ action: z.literal("save_text_block") }).strict(),
  identityTextInitializationIntentSchema,
]);
export type IdentityTextEditorCommand = z.infer<typeof identityTextEditorCommandSchema>;
