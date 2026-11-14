import "server-only";
import { withPublishedMediaRead } from "./media-admission";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { canonicalMediaDescriptorSchema, downloadCanonicalPublishedMedia } from "./canonical-media";
import { publicHandleSchema, publicSpillReferenceSchema } from "./locators";

const descriptorSchema = canonicalMediaDescriptorSchema.extend({
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
type Descriptor = z.infer<typeof descriptorSchema>;

async function resolve(handle: string, reference: number, signal:AbortSignal): Promise<Descriptor | null> {
  const client = createSupabaseServiceClient((input,init)=>fetch(input,{...init,cache:"no-store",redirect:"error"}));
  const { data, error } = await client.schema("api").rpc("resolve_published_product_media_server", {
    input_handle: handle, input_spill_reference: reference,
  }).abortSignal(signal);
  const parsed = descriptorSchema.safeParse(data);
  return !signal.aborted && !error && parsed.success && parsed.data.spill_reference === reference ? parsed.data : null;
}

export async function readPublishedProductMedia(handle: unknown, reference: unknown): Promise<Buffer | null> {
  const locator = publicHandleSchema.safeParse(handle);
  const item = publicSpillReferenceSchema.safeParse(reference);
  if (!locator.success || !item.success) return null;
  return withPublishedMediaRead(async (signal,currentRead)=>{
    const selected = await resolve(locator.data, item.data,signal);
    if (!selected||!currentRead()) return null;
    const bytes = await downloadCanonicalPublishedMedia(selected,signal);
    if(!currentRead())return null;
    const current = await resolve(locator.data, item.data,signal);
    if (!current || JSON.stringify(current) !== JSON.stringify(selected)) return null;
    return bytes;
  });
}
