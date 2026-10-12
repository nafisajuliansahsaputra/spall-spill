import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const drafts = z.object({ status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  product_drafts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resource_drafts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type OwnerHomeDrafts = z.infer<typeof drafts>;

/** Unmounted current-session reader. Claims/state proof and scoped grants are enabling gates. */
export function createOwnerHomeDraftsReader(client: Pick<SupabaseClient, "schema">) {
  return {
    async read(): Promise<OwnerHomeDrafts | null> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const { data, error } = await client.schema("api").rpc("resolve_current_owner_home_drafts").abortSignal(controller.signal);
            if (controller.signal.aborted || error !== null) return null;
            const parsed = drafts.safeParse(data);
            return parsed.success ? parsed.data : null;
          })(),
          new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000); }),
        ]);
      } catch { return null; }
      finally { clearTimeout(timer); }
    },
  };
}
