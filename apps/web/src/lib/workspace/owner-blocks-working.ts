import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inspectIdentityLinkWorkingInput } from "./identity-link-working-input";

const block = z.object({
  block_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  kind: z.enum(["social", "generic_link", "contact", "media", "text", "spill_cta"]),
  is_visible: z.boolean(), position: z.number().int().min(1).max(2147483647),
  payload_state: z.enum(["missing", "present", "not_implemented"]),
  link_working: z.object({ title: z.string().nullable(), social_platform: z.string().nullable(),
    destination_url: z.string().nullable() }).strict().nullable(),
}).strict().superRefine((value, ctx) => {
  const isLink = value.kind === "social" || value.kind === "generic_link";
  const valid = isLink ? value.link_working === null ? value.payload_state === "missing"
    : value.payload_state === "present" && inspectIdentityLinkWorkingInput({ ...value.link_working, kind: value.kind }).status === "working"
    : value.payload_state === "not_implemented" && value.link_working === null;
  if (!valid) ctx.addIssue({ code: "custom", message: "Inconsistent Working payload" });
});
const context = z.object({ status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  collection: z.object({ revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    blocks: z.array(block).max(500).refine(rows => new Set(rows.map(row => row.block_id)).size === rows.length
      && rows.every((row, index) => index === 0 || rows[index - 1]!.position < row.position)),
  }).strict().nullable(),
}).strict().transform(value => ({ ...value, collection: value.collection === null ? null : {
  ...value.collection, blocks: value.collection.blocks.map(row => {
    const inspected = row.link_working === null ? null : inspectIdentityLinkWorkingInput({ ...row.link_working, kind: row.kind });
    return { ...row, issues: inspected?.status === "working" ? inspected.issues : [] };
  }),
} }));
export type OwnerBlocksWorking = z.infer<typeof context>;

/** Unmounted current-session transport. Claims/state recheck assembly remains an enabling gate. */
export function createOwnerBlocksWorkingReader(client: Pick<SupabaseClient, "schema">) {
  return {
    async read(): Promise<OwnerBlocksWorking | null> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          (async () => {
            const { data, error } = await client.schema("api").rpc("resolve_current_owner_blocks_working").abortSignal(controller.signal);
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
