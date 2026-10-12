import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const asciiSpace = [9, 10, 11, 12, 13, 32];
function persistedText(max: number, allowLf: boolean, rejectBoundarySpace: boolean) {
  return z.string().refine(value => {
    const points = Array.from(value);
    return points.length >= 1 && points.length <= max
      && !points.some(char => { const code = char.codePointAt(0)!;
        return (code < 32 && !(allowLf && code === 10)) || code === 127; })
      && (!rejectBoundarySpace || (!asciiSpace.includes(points[0]!.codePointAt(0)!)
        && !asciiSpace.includes(points.at(-1)!.codePointAt(0)!)));
  });
}

const context = z.object({ status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  profile_working: z.object({
    display_name: persistedText(80, false, true),
    bio: persistedText(300, true, true).nullable(),
    profile_asset_key: persistedText(512, false, false).nullable(),
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  }).strict(),
}).strict();
export type OwnerProfileWorking = z.infer<typeof context>;

/** Unmounted current-session reader. Claims/state proof and scoped grants are enabling gates. */
export function createOwnerProfileWorkingReader(client: Pick<SupabaseClient, "schema">) {
  return {
    async read(): Promise<OwnerProfileWorking | null> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const { data, error } = await client.schema("api").rpc("resolve_current_owner_profile_working").abortSignal(controller.signal);
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
