import "server-only";
import { createHash } from "node:crypto";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
import { z } from "zod";
import { publicHandleSchema } from "./locators";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const publishedResourceSourceRequestSchema = z.object({
  handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  publication_token: hashSchema, source_hash: hashSchema,
}).strict();
const resultSchema = z.object({ status: z.literal("success"), source_url: z.string().min(8).max(2048) }).strict();

/** Pure staged server validation; no RPC, browser context authority or source action. */
export function validatePublishedResourceSourceResult(request: unknown, result: unknown): string | null {
  const binding = publishedResourceSourceRequestSchema.safeParse(request);
  const selected = resultSchema.safeParse(result);
  if (!binding.success || !selected.success) return null;
  const url = selected.data.source_url;
  try {
    if (normalizeExternalDestination(url).normalizedUrl !== url
      || createHash("sha256").update(url).digest("hex") !== binding.data.source_hash) return null;
    return url;
  } catch { return null; }
}
