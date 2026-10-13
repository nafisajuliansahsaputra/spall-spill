import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const destination = z.string().refine(value => {
  const length = Array.from(value).length;
  return length >= 8 && length <= 2048 && !/[\x00-\x20\x7f\\]/.test(value)
    && /^https?:\/\/[^/?#]+([/?#].*)?$/i.test(value);
});
const connection = z.discriminatedUnion("connection_kind", [
  z.object({ connection_kind: z.literal("generic_link"), social_platform: z.null(),
    destination_url: destination, revision }).strict(),
  z.object({ connection_kind: z.literal("social"),
    social_platform: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
    destination_url: destination, revision }).strict(),
]);
const context = z.object({ status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  profile_revision: revision,
  layout_working: z.object({ starter_key: z.enum(["clean", "social_focus", "featured", "business"]), revision }).strict(),
  connection_working: connection.nullable(),
  identity_work: z.enum(["never_published", "unchanged", "unpublished_changes"]),
}).strict();
export type OwnerCompositionWorking = z.infer<typeof context>;

/** Unmounted current-session reader. Claims/state proof and scoped grants are enabling gates. */
export function createOwnerCompositionWorkingReader(client: Pick<SupabaseClient, "schema">) {
  return {
    async read(): Promise<OwnerCompositionWorking | null> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const { data, error } = await client.schema("api").rpc("resolve_current_owner_composition_working").abortSignal(controller.signal);
            if (controller.signal.aborted || error !== null) return null;
            const parsed = context.safeParse(data);
            return parsed.success ? parsed.data : null;
          })(),
          new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000); }),
        ]);
      } catch { return null; }
      finally { clearTimeout(timer); }
    },
  };
}
