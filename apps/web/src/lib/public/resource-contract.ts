import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
import { z } from "zod";
import { resourceTypeSchema } from "@/lib/onboarding/resource-draft-contract";
import { publicHandleSchema } from "./locators";

const contextText = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value));
const sourceUrlSchema = z.string().min(8).max(2048).refine((value) => {
  try { return normalizeExternalDestination(value).normalizedUrl === value; }
  catch { return false; }
});

export const publicResourceSchema = z.object({
  status: z.literal("success"), current_handle: publicHandleSchema,
  display_name: contextText(80),
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  resource_type: resourceTypeSchema, title: contextText(160),
  available: z.boolean(), source_url: sourceUrlSchema.nullable(),
}).strict().refine((resource) => resource.available
  ? resource.source_url !== null : resource.source_url === null);
export const publicResourcePayloadSchema = z.union([
  publicResourceSchema, z.object({ status: z.literal("unavailable") }).strict(),
]);
export type PublicResource = z.infer<typeof publicResourceSchema>;
