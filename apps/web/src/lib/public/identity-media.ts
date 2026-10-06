import "server-only";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { canonicalMediaDescriptorSchema as descriptorSchema, downloadCanonicalPublishedMedia } from "./canonical-media";
import { publicHandleSchema } from "./locators";

type Descriptor = z.infer<typeof descriptorSchema>;

async function resolve(handle: string): Promise<Descriptor | null> {
  const client = createSupabaseServiceClient();
  const { data, error } = await client.schema("api").rpc("resolve_published_identity_media_server", { input_handle: handle });
  const parsed = descriptorSchema.safeParse(data);
  return !error && parsed.success ? parsed.data : null;
}

export async function readPublishedIdentityMedia(handle: unknown): Promise<Buffer | null> {
  const locator = publicHandleSchema.safeParse(handle);
  if (!locator.success) return null;
  try {
    const selected = await resolve(locator.data);
    if (!selected) return null;
    const bytes = await downloadCanonicalPublishedMedia(selected);
    const current = await resolve(locator.data);
    if (!current || JSON.stringify(current) !== JSON.stringify(selected)) return null;
    return bytes;
  } catch { return null; }
}
