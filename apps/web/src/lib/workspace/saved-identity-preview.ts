import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerEditableIdentityWorking } from "./owner-editable-identity-working";
import { createTrustedProfileMediaPreviewUrl } from "@/lib/profile-media/preview";

/** Request-bound private Working, never a public projection or Publish receipt. */
export async function readSavedIdentityPreview(client: Pick<SupabaseClient, "auth" | "schema">) {
  const reader = createOwnerEditableIdentityWorking(client);
  const first = await reader.read();
  if (first.status !== "success") return first;
  const keys = new Set<string>();
  if (first.profile_working.profile_asset_key) keys.add(first.profile_working.profile_asset_key);
  for (const block of first.collection?.blocks ?? []) {
    if (block.is_visible && block.kind === "media" && block.media_asset_state === "registered" && block.working?.asset_key) keys.add(block.working.asset_key);
  }
  const queue = [...keys];
  const media: Record<string, string | null> = {};
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const signed = await Promise.race([
      Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (!stopped) {
          const key = queue.shift();
          if (key === undefined) break;
          const url = await createTrustedProfileMediaPreviewUrl(key);
          if (stopped) return;
          media[key] = url;
        }
      })).then(() => true),
      new Promise<false>(resolve => { timer = setTimeout(() => { stopped = true; resolve(false); }, 3000); }),
    ]);
    if (!signed) return { status: "unavailable" } as const;
    const second = await reader.read();
    if (second.status !== "success") return second;
    if (JSON.stringify(first) !== JSON.stringify(second)) return { status: "unavailable" } as const;
    return { ...second, preview_media: media };
  } catch { return { status: "unavailable" } as const; }
  finally { stopped = true; clearTimeout(timer); }
}
