import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityBlockPageRequestSchema } from "./identity-block-page-request";
import { identityBlockWorkingRowSchema } from "./owner-blocks-working";
import { inspectIdentityLinkWorkingInput } from "./identity-link-working-input";

const position = z.number().int().min(1).max(2147483647);
const collection = z.object({
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  blocks: z.array(identityBlockWorkingRowSchema).max(100),
  has_more: z.boolean(), next_after_position: position.nullable(),
}).strict().refine(value => new Set(value.blocks.map(row => row.block_id)).size === value.blocks.length
  && value.blocks.every((row, index) => index === 0 || value.blocks[index - 1]!.position < row.position)
  && (value.has_more ? value.blocks.length === 100 && value.next_after_position === value.blocks.at(-1)!.position
    : value.next_after_position === null));
const response = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"),
    current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
    primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
    collection: collection.nullable(),
  }).strict(),
  z.object({ status: z.enum(["unavailable", "invalid_page_request", "stale_read"]) }).strict(),
]).transform(value => {
  if (value.status !== "success" || value.collection === null) return value;
  return { ...value, collection: { ...value.collection, blocks: value.collection.blocks.map(row => {
    const inspected = row.link_working === null ? null : inspectIdentityLinkWorkingInput({ ...row.link_working, kind: row.kind });
    return { ...row, issues: inspected?.status === "working" ? inspected.issues : [] };
  }) } };
});
export type OwnerBlocksWorkingPageResult = z.infer<typeof response>;

/** One private page only. Full reconstruction/current-subject recheck remains a separate enabling gate. */
export function createOwnerBlocksWorkingPageReader(client: Pick<SupabaseClient, "schema">) {
  return {
    async read(value: unknown): Promise<OwnerBlocksWorkingPageResult> {
      const request = identityBlockPageRequestSchema.safeParse(value);
      if (!request.success) return { status: "invalid_page_request" };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unavailable = (): OwnerBlocksWorkingPageResult => ({ status: "unavailable" });
      try {
        return await Promise.race([
          (async (): Promise<OwnerBlocksWorkingPageResult> => {
            const reply = await client.schema("api").rpc("resolve_current_owner_blocks_working_page", {
              input_request: request.data,
            }).abortSignal(controller.signal);
            if (controller.signal.aborted || reply.error !== null) return unavailable();
            const parsed = response.safeParse(reply.data);
            if (!parsed.success) return unavailable();
            if (parsed.data.status === "success" && request.data.after_position !== null) {
              const page = parsed.data.collection;
              if (page === null || page.revision !== request.data.expected_collection_revision
                || page.blocks.some(row => row.position <= request.data.after_position!)) return unavailable();
            }
            return parsed.data;
          })(),
          new Promise<OwnerBlocksWorkingPageResult>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(unavailable());
          }, 5000); }),
        ]);
      } catch { return unavailable(); }
      finally { clearTimeout(timer); }
    },
  };
}
