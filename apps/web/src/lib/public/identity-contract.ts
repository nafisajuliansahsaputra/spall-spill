import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { starterKeySchema } from "../onboarding/validation";

export const identityBindingSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const publicIdentitySchema = z.object({
  status: z.literal("success"), current_handle: publicHandleSchema,
  display_name: z.string().min(1).max(160).refine(v => v.trim().length > 0 && Array.from(v).length <= 80),
  bio: z.string().max(600).refine(v => Array.from(v).length <= 300).nullable(), starter_key: starterKeySchema,
  connection: z.object({ connection_kind: z.enum(["social", "generic_link"]),
    social_platform: z.string().min(1).max(40).nullable(), available: z.boolean(),
    binding: identityBindingSchema,
  }).strict().refine(c => c.connection_kind === "social" ? c.social_platform !== null : c.social_platform === null).nullable(), has_spill: z.boolean(),
}).strict();
export const publicIdentityPayloadSchema = z.union([publicIdentitySchema,
  z.object({ status: z.literal("unavailable") }).strict()]);
export type PublicIdentity = z.infer<typeof publicIdentitySchema>;
