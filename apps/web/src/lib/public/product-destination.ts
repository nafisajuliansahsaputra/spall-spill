import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { productDestinationSchema } from "@/lib/onboarding/product-preparation-contract";
import { publicHandleSchema } from "./locators";
import { providerKeySchema } from "./product-contract";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const publishedProductDestinationRequestSchema = z.object({
  handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  provider_key: providerKeySchema,
  publication_token: hashSchema,
  destination_hash: hashSchema,
}).strict();
const resultSchema = z.object({
  status: z.literal("success"), destination_url: z.string().min(8).max(2048),
}).strict();

/** Validates a staged server result; does not authorize browser input or perform a redirect. */
export function validatePublishedProductDestinationResult(request: unknown, result: unknown): string | null {
  const intent = publishedProductDestinationRequestSchema.safeParse(request);
  const selected = resultSchema.safeParse(result);
  if (!intent.success || !selected.success) return null;
  const url = selected.data.destination_url;
  if (!productDestinationSchema.safeParse({ provider_key: intent.data.provider_key, destination_url: url }).success
    || createHash("sha256").update(url).digest("hex") !== intent.data.destination_hash) return null;
  return url;
}
