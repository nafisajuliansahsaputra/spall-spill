import "server-only";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { canonicalMediaDescriptorSchema, downloadCanonicalPublishedMedia } from "./canonical-media";
import { publicHandleSchema, publicSpillReferenceSchema } from "./locators";

const descriptorSchema = canonicalMediaDescriptorSchema.extend({
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
type Descriptor = z.infer<typeof descriptorSchema>;

async function resolve(handle: string, reference: number): Promise<Descriptor | null> {
  const client = createSupabaseServiceClient();
  const { data, error } = await client.schema("api").rpc("resolve_published_product_media_server", {
    input_handle: handle, input_spill_reference: reference,
  });
  const parsed = descriptorSchema.safeParse(data);
  return !error && parsed.success && parsed.data.spill_reference === reference ? parsed.data : null;
}

export async function readPublishedProductMedia(handle: unknown, reference: unknown): Promise<Buffer | null> {
  const locator = publicHandleSchema.safeParse(handle);
  const item = publicSpillReferenceSchema.safeParse(reference);
  if (!locator.success || !item.success) return null;
  try {
    const selected = await resolve(locator.data, item.data);
    if (!selected) return null;
    const bytes = await downloadCanonicalPublishedMedia(selected);
    const current = await resolve(locator.data, item.data);
    if (!current || JSON.stringify(current) !== JSON.stringify(selected)) return null;
    return bytes;
  } catch { return null; }
}
