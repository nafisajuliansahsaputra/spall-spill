import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityMediaWorkingInputSchema, inspectIdentityMediaWorkingInput } from "./identity-media-working-input";

const blockId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const requestSchema = z.object({ block_id: blockId }).strict();
export { requestSchema as ownerMediaBlockWorkingRequestSchema };
const block = z.object({
  block_id: blockId, kind: z.literal("media"), is_visible: z.boolean(),
  position: z.number().int().min(1).max(2147483647),
  payload_state: z.enum(["missing", "present"]),
  media_working: identityMediaWorkingInputSchema.omit({ kind: true }).extend({
    asset_key: z.string().uuid().regex(/^[0-9a-f-]+$/).nullable(),
  }).nullable(),
  asset_state: z.enum(["not_selected", "registered", "unavailable"]),
}).strict().refine(value => (value.payload_state === "missing") === (value.media_working === null)
  && ((value.media_working?.asset_key ?? null) === null) === (value.asset_state === "not_selected"));
const responseSchema = z.object({
  status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), block,
}).strict().transform(value => {
  const inspected = value.block.media_working === null ? null
    : inspectIdentityMediaWorkingInput({ kind: "media", ...value.block.media_working });
  return { ...value, block: { ...value.block, issues: inspected?.status === "working" ? inspected.issues : [] } };
});
export type OwnerMediaBlockWorking = z.infer<typeof responseSchema>;

/** Unmounted selected reader; registry state is not delivery or current-subject final proof. */
export function createOwnerMediaBlockWorkingReader(client: Pick<SupabaseClient, "schema">) {
  return {
    async read(value: unknown): Promise<OwnerMediaBlockWorking | null> {
      const request = requestSchema.safeParse(value);
      if (!request.success) return null;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const reply = await client.schema("api").rpc("resolve_current_owner_media_block_working", {
              input_block_id: request.data.block_id,
            }).abortSignal(controller.signal);
            if (controller.signal.aborted || reply.error !== null) return null;
            const parsed = responseSchema.safeParse(reply.data);
            return parsed.success && parsed.data.block.block_id === request.data.block_id ? parsed.data : null;
          })(),
          new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000); }),
        ]);
      } catch { return null; }
      finally { clearTimeout(timer); }
    },
  };
}
