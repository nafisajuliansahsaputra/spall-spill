import "server-only";
import { z } from "zod";
import { identityMediaAdditionIntentSchema } from "./identity-media-addition-intent";
import { identityMediaSaveIntentSchema } from "./identity-media-save-intent";
import { identityMediaInitializationIntentSchema } from "./identity-media-initialization-intent";

/** Explicit local command only. Save dispatch must remove this facade action. */
export const identityMediaEditorCommandSchema = z.discriminatedUnion("action", [
  identityMediaAdditionIntentSchema,
  identityMediaSaveIntentSchema.extend({ action: z.literal("save_media_block") }).strict(),
  identityMediaInitializationIntentSchema,
]);
export type IdentityMediaEditorCommand = z.infer<typeof identityMediaEditorCommandSchema>;
