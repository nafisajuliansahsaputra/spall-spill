import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityDestinationReviewPagePayloadSchema, type OwnerIdentityDestinationReviewPageResult } from "./owner-identity-destination-review";
import { createOwnerPrivateWorkingPageReader } from "./owner-private-working-page-reader";
import { createOwnerWorkingPageAssembly, type OwnerWorkingPageAssemblyResult } from "./owner-working-page-assembly";

export const identityReviewSnapshotHashSchema = z.string().length(64).regex(/^[0-9a-f]{64}$/);
type Page = Extract<OwnerIdentityDestinationReviewPageResult, { status: "success" }>;
type Row = NonNullable<Page["collection"]>["blocks"][number];
type ReviewPage = Page & { snapshot_hash: string; review_format: "identity_working_review_v1" };
const success = z.object({ status: z.literal("success"), snapshot_hash: identityReviewSnapshotHashSchema,
  review_format: z.literal("identity_working_review_v1"),
  collection: z.object({ revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    blocks: z.array(z.unknown()).max(1000), has_more: z.literal(false), next_after_position: z.null() }).strict().nullable(),
}).passthrough().transform((value, context): ReviewPage | typeof z.NEVER => {
  const { snapshot_hash, review_format, collection, ...root } = value;
  let first: Page | null = null;
  const rows: Row[] = [];
  const ids = new Set<string>();
  const chunks = collection === null || collection.blocks.length === 0 ? [null]
    : Array.from({ length: Math.ceil(collection.blocks.length / 100) }, (_, i) => collection.blocks.slice(i * 100, (i + 1) * 100));
  for (const [index, chunk] of chunks.entries()) {
    const last = index === chunks.length - 1;
    const candidate = { ...root, collection: collection === null ? null : { revision: collection.revision,
      blocks: chunk ?? [], has_more: !last,
      next_after_position: last ? null : (chunk?.at(-1) as { position?: unknown } | undefined)?.position } };
    const parsed = identityDestinationReviewPagePayloadSchema.safeParse(candidate);
    if (!parsed.success || parsed.data.status !== "success") {
      context.addIssue({ code: "custom", message: "Invalid complete Identity review." }); return z.NEVER;
    }
    first ??= parsed.data;
    for (const row of parsed.data.collection?.blocks ?? []) {
      if (ids.has(row.block_id) || (rows.length > 0 && rows.at(-1)!.position >= row.position)) {
        context.addIssue({ code: "custom", message: "Invalid complete member ordering." }); return z.NEVER;
      }
      ids.add(row.block_id); rows.push(row);
    }
  }
  if (first === null) { context.addIssue({ code: "custom", message: "Missing review." }); return z.NEVER; }
  return { ...first, snapshot_hash, review_format, collection: collection === null ? null : {
    revision: collection.revision, blocks: rows, has_more: false, next_after_position: null } };
});
const response = z.union([success, z.object({ status: z.enum(["unavailable", "invalid_page_request", "stale_read"]) }).strict()]);
export type OwnerIdentityReviewSnapshotPageResult = z.infer<typeof response>;
export type OwnerIdentityReviewSnapshotResult = OwnerWorkingPageAssemblyResult<Row, Omit<ReviewPage, "collection">>;

/** Private complete statement snapshot; confirmation and publication are separate operations. */
export function createOwnerIdentityReviewSnapshotPageReader(client: Pick<SupabaseClient, "schema">) {
  return createOwnerPrivateWorkingPageReader(client, "resolve_current_owner_identity_review_snapshot", value => response.safeParse(value));
}
/** Same guarded reader engine; one complete statement per observation, never partial review. */
export function createOwnerIdentityReviewSnapshot(client: Pick<SupabaseClient, "auth" | "schema">) {
  return createOwnerWorkingPageAssembly<Row, Omit<ReviewPage, "collection">>(client, createOwnerIdentityReviewSnapshotPageReader(client), 67108864);
}
