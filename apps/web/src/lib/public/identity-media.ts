import "server-only";
import { z } from "zod";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createProfileMediaR2Connection } from "@/lib/profile-media/r2";
import { PROFILE_MEDIA_MAX_CANONICAL_BYTES } from "@spall-spill/profile-media-policy";
import { publicHandleSchema } from "./locators";

const descriptorSchema = z.object({
  status: z.literal("success"), current_handle: publicHandleSchema,
  object_key: z.string().regex(/^working\/profile\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/),
  content_type: z.literal("image/webp"), byte_size: z.number().int().min(12).max(PROFILE_MEDIA_MAX_CANONICAL_BYTES),
  width: z.number().int().min(1).max(2048), height: z.number().int().min(1).max(2048),
  publication_token: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
type Descriptor = z.infer<typeof descriptorSchema>;

async function resolve(handle: string): Promise<Descriptor | null> {
  const client = createSupabaseServiceClient();
  const { data, error } = await client.schema("api").rpc("resolve_published_identity_media_server", { input_handle: handle });
  const parsed = descriptorSchema.safeParse(data);
  return !error && parsed.success ? parsed.data : null;
}

async function download(descriptor: Descriptor): Promise<Buffer> {
  const { client, bucket } = createProfileMediaR2Connection();
  const deadline = AbortSignal.timeout(10_000);
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: descriptor.object_key }), { abortSignal: deadline });
  if (!(object.Body instanceof Readable)) throw new Error("Unavailable media.");
  const body = object.Body;
  const abort = () => body.destroy(new Error("Unavailable media."));
  deadline.addEventListener("abort", abort, { once: true });
  try {
    if (deadline.aborted || object.ContentType !== "image/webp" || object.ContentLength !== descriptor.byte_size) {
      throw new Error("Unavailable media.");
    }
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of body) {
      if (!(chunk instanceof Uint8Array)) throw new Error("Unavailable media.");
      size += chunk.byteLength;
      if (deadline.aborted || size > descriptor.byte_size) throw new Error("Unavailable media.");
      chunks.push(Buffer.from(chunk));
    }
    if (deadline.aborted || size !== descriptor.byte_size) throw new Error("Unavailable media.");
    const bytes = Buffer.concat(chunks, size);
    if (bytes.subarray(0,4).toString("ascii") !== "RIFF" || bytes.subarray(8,12).toString("ascii") !== "WEBP"
      || bytes.readUInt32LE(4)+8 !== size) throw new Error("Unavailable media.");
    return bytes;
  } finally {
    deadline.removeEventListener("abort", abort);
    body.destroy();
  }
}

export async function readPublishedIdentityMedia(handle: unknown): Promise<Buffer | null> {
  const locator = publicHandleSchema.safeParse(handle);
  if (!locator.success) return null;
  try {
    const selected = await resolve(locator.data);
    if (!selected) return null;
    const bytes = await download(selected);
    const current = await resolve(locator.data);
    if (!current || JSON.stringify(current) !== JSON.stringify(selected)) return null;
    return bytes;
  } catch { return null; }
}
