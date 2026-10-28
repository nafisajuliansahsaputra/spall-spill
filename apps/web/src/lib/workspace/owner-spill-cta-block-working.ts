import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identitySpillCtaWorkingInputSchema } from "./identity-spill-cta-working-command";

const blockId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const requestSchema = z.object({ block_id: blockId }).strict();
export { requestSchema as ownerSpillCtaBlockWorkingRequestSchema };
const block = z.object({
  block_id: blockId, kind: z.literal("spill_cta"), is_visible: z.boolean(),
  position: z.number().int().min(1).max(2147483647),
  payload_state: z.enum(["missing", "present"]),
  spill_cta_working: identitySpillCtaWorkingInputSchema.omit({ kind: true }).nullable(),
}).strict().refine(value => (value.payload_state === "missing") === (value.spill_cta_working === null));
const responseSchema = z.object({
  status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), block,
}).strict();
export type OwnerSpillCtaBlockWorking = z.infer<typeof responseSchema>;

/** Unmounted selected reader; semantic target is not public availability or current-subject final proof. */
export function createOwnerSpillCtaBlockWorkingReader(client: Pick<SupabaseClient, "schema">) {
  return {
    async read(value: unknown): Promise<OwnerSpillCtaBlockWorking | null> {
      const request = requestSchema.safeParse(value);
      if (!request.success) return null;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const reply = await client.schema("api").rpc("resolve_current_owner_spill_cta_block_working", {
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
