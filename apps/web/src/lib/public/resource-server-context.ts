import "server-only";
import { z } from "zod";
import { parseExactSpillReferenceLocator } from "./exact-reference-locator";
import { publicResourceSchema } from "./resource-contract";
import { publishedResourceSourceRequestSchema, validatePublishedResourceSourceResult } from "./resource-source";

const contextSchema = z.object({ status: z.literal("success"), recognition: publicResourceSchema,
  binding: publishedResourceSourceRequestSchema.nullable() }).strict();
export type PublishedResourceServerContext = z.infer<typeof contextSchema>;

/** Parses a trusted private RPC context; never turns browser/raw bindings into authority. */
export function parsePublishedResourceServerContext(locator: unknown, response: unknown): PublishedResourceServerContext | null {
  try {
    const requested = parseExactSpillReferenceLocator(locator);
    if (requested === null) return null;
    const parsed = contextSchema.safeParse(response);
    if (!parsed.success) return null;
    const { recognition, binding } = parsed.data;
    if (recognition.spill_reference !== requested.spill_reference) return null;
    if (!recognition.available) return binding === null ? parsed.data : null;
    if (binding === null || binding.handle !== recognition.current_handle
      || binding.spill_reference !== recognition.spill_reference
      || validatePublishedResourceSourceResult(binding, { status: "success", source_url: recognition.source_url }) === null) return null;
    return parsed.data;
  } catch { return null; }
}
