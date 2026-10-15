import "server-only";
import { z } from "zod";
import { identityLinkAdditionIntentSchema } from "./identity-link-addition-intent";
import { identityLinkInitializationIntentSchema } from "./identity-link-initialization-intent";

/** Explicit intent selects the operation; collection absence never selects it. */
export const identityLinkEditorCommandSchema = z.discriminatedUnion("action", [
  identityLinkAdditionIntentSchema,
  identityLinkInitializationIntentSchema,
]);
export type IdentityLinkEditorCommand = z.infer<typeof identityLinkEditorCommandSchema>;
