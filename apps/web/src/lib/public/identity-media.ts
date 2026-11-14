import "server-only";
import { withPublishedMediaRead } from "./media-admission";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { canonicalMediaDescriptorSchema as descriptorSchema, downloadCanonicalPublishedMedia } from "./canonical-media";
import { publicHandleSchema } from "./locators";

type Descriptor = z.infer<typeof descriptorSchema>;

async function resolve(handle: string, signal:AbortSignal): Promise<Descriptor | null> {
  const client = createSupabaseServiceClient((input,init)=>fetch(input,{...init,cache:"no-store",redirect:"error"}));
  const { data, error } = await client.schema("api").rpc("resolve_published_identity_media_server", { input_handle: handle }).abortSignal(signal);
  const parsed = descriptorSchema.safeParse(data);
  return !signal.aborted && !error && parsed.success ? parsed.data : null;
}

export async function readPublishedIdentityMedia(handle: unknown): Promise<Buffer | null> {
  const locator = publicHandleSchema.safeParse(handle);
  if (!locator.success) return null;
  return withPublishedMediaRead(async (signal,currentRead)=>{
    const selected = await resolve(locator.data,signal);
    if (!selected||!currentRead()) return null;
    const bytes = await downloadCanonicalPublishedMedia(selected,signal);
    if(!currentRead())return null;
    const current = await resolve(locator.data,signal);
    if (!current || JSON.stringify(current) !== JSON.stringify(selected)) return null;
    return bytes;
  });
}
