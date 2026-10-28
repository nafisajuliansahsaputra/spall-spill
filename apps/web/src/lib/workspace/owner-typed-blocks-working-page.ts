import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerPrivateWorkingPageReader } from "./owner-private-working-page-reader";
import { identityLinkWorkingInputSchema, inspectIdentityLinkWorkingInput } from "./identity-link-working-input";
import { identityTextWorkingInputSchema, inspectIdentityTextWorkingInput } from "./identity-text-working-input";
import { identityContactWorkingInputSchema, inspectIdentityContactWorkingInput } from "./identity-contact-working-input";
import { identityMediaWorkingInputSchema, inspectIdentityMediaWorkingInput } from "./identity-media-working-input";
import { identitySpillCtaWorkingInputSchema } from "./identity-spill-cta-working-command";

const position = z.number().int().min(1).max(2147483647);
const metadata = {
  block_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  position, is_visible: z.boolean(), payload_state: z.enum(["missing", "present"]),
};
export const typedIdentityWorkingRowSchema = z.discriminatedUnion("kind", [
  z.object({ ...metadata, kind: z.literal("social"),
    working: identityLinkWorkingInputSchema.extend({ kind: z.literal("social") }).nullable(), media_asset_state: z.null() }).strict(),
  z.object({ ...metadata, kind: z.literal("generic_link"),
    working: identityLinkWorkingInputSchema.extend({ kind: z.literal("generic_link") }).nullable(), media_asset_state: z.null() }).strict(),
  z.object({ ...metadata, kind: z.literal("text"),
    working: identityTextWorkingInputSchema.nullable(), media_asset_state: z.null() }).strict(),
  z.object({ ...metadata, kind: z.literal("contact"),
    working: identityContactWorkingInputSchema.nullable(), media_asset_state: z.null() }).strict(),
  z.object({ ...metadata, kind: z.literal("media"),
    working: identityMediaWorkingInputSchema.extend({ asset_key: z.string().uuid().regex(/^[0-9a-f-]+$/).nullable() }).nullable(),
    media_asset_state: z.enum(["not_selected", "registered", "unavailable"]) }).strict(),
  z.object({ ...metadata, kind: z.literal("spill_cta"),
    working: identitySpillCtaWorkingInputSchema.nullable(), media_asset_state: z.null() }).strict(),
]).refine(row => (row.payload_state === "missing") === (row.working === null)
  && (row.working === null || row.working.kind === row.kind)
  && (row.kind !== "media" ? row.media_asset_state === null
    : row.media_asset_state !== null && ((row.working?.kind === "media" ? row.working.asset_key : null) === null)
      === (row.media_asset_state === "not_selected")));
export const typedIdentityWorkingCollectionSchema = z.object({ revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  blocks: z.array(typedIdentityWorkingRowSchema).max(100), has_more: z.boolean(), next_after_position: position.nullable(),
}).strict().refine(value => new Set(value.blocks.map(row => row.block_id)).size === value.blocks.length
  && value.blocks.every((row, index) => index === 0 || value.blocks[index - 1]!.position < row.position)
  && (value.has_more ? value.blocks.length === 100 && value.next_after_position === value.blocks.at(-1)!.position
    : value.next_after_position === null));
export function inspectTypedIdentityWorkingPayloadIssues(value: z.infer<typeof typedIdentityWorkingRowSchema>["working"]) {
  if (value === null) return [];
  const result = value.kind === "social" || value.kind === "generic_link" ? inspectIdentityLinkWorkingInput(value)
    : value.kind === "text" ? inspectIdentityTextWorkingInput(value)
      : value.kind === "contact" ? inspectIdentityContactWorkingInput(value)
        : value.kind === "media" ? inspectIdentityMediaWorkingInput(value) : null;
  return result?.status === "working" ? result.issues : [];
}
const response = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
    primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]), collection: typedIdentityWorkingCollectionSchema.nullable(),
  }).strict(),
  z.object({ status: z.enum(["unavailable", "invalid_page_request", "stale_read"]) }).strict(),
]).transform(value => {
  if (value.status !== "success") return value;
  if (value.collection === null) return { ...value, collection: null };
  return { ...value, collection: { ...value.collection,
    blocks: value.collection.blocks.map(row => ({ ...row, issues: inspectTypedIdentityWorkingPayloadIssues(row.working) })),
  } };
});
export type OwnerTypedBlocksWorkingPageResult = z.infer<typeof response>;

/** Private page only; local diagnostics and registry observations are not Publish authority. */
export function createOwnerTypedBlocksWorkingPageReader(client: Pick<SupabaseClient, "schema">) {
  return createOwnerPrivateWorkingPageReader(client, "resolve_current_owner_typed_blocks_working_page", value => response.safeParse(value));
}
