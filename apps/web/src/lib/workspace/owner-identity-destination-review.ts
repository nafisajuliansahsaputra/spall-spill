import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { previewSafetySchema } from "@/lib/onboarding/preview-contract";
import { editableIdentityWorkingPageSchema } from "./owner-editable-identity-working";
import { typedIdentityWorkingRowSchema, typedIdentityWorkingCollectionSchema, inspectTypedIdentityWorkingPayloadIssues } from "./owner-typed-blocks-working-page";
import { inspectProfileTextWorkingInput } from "./profile-text-working-input";
import { createOwnerPrivateWorkingPageReader } from "./owner-private-working-page-reader";
import { createOwnerWorkingPageAssembly, type OwnerWorkingPageAssemblyResult } from "./owner-working-page-assembly";

const safety = previewSafetySchema.nullable();
const row = z.object({ destination_safety: safety }).passthrough().transform((value, context) => {
  const { destination_safety, ...raw } = value;
  const parsed = typedIdentityWorkingRowSchema.safeParse(raw);
  if (!parsed.success) {
    context.addIssue({ code: "custom", message: "Invalid typed Working row." }); return z.NEVER;
  }
  const data = parsed.data;
  const applicable = data.is_visible && (data.kind === "social" || data.kind === "generic_link")
    && data.working !== null && data.working.destination_url !== null;
  if (applicable !== (destination_safety !== null)) {
    context.addIssue({ code: "custom", message: "Safety does not match selected active destination." }); return z.NEVER;
  }
  return { ...data, destination_safety, issues: inspectTypedIdentityWorkingPayloadIssues(data.working) };
});
const success = z.object({ ...editableIdentityWorkingPageSchema.shape,
  source_destination_safety: safety,
  collection: z.object({ ...typedIdentityWorkingCollectionSchema.shape, blocks: z.array(row).max(100) }).strict().nullable(),
}).strict().refine(value => {
  const { source_destination_safety, ...base } = value;
  const original = { ...base, collection: base.collection === null ? null : { ...base.collection,
    blocks: base.collection.blocks.map(value => ({ block_id: value.block_id, kind: value.kind,
      position: value.position, is_visible: value.is_visible, payload_state: value.payload_state,
      working: value.working, media_asset_state: value.media_asset_state })) } };
  return editableIdentityWorkingPageSchema.safeParse(original).success
    && (value.connection_source_working !== null) === (source_destination_safety !== null);
});
const response = z.discriminatedUnion("status", [success,
  z.object({ status: z.enum(["unavailable", "invalid_page_request", "stale_read"]) }).strict(),
]).transform(value => {
  if (value.status !== "success") return value;
  const text = value.profile_text_working ?? value.profile_working;
  const editable_profile = { display_name: text.display_name, bio: text.bio, profile_asset_key: value.profile_working.profile_asset_key };
  return { ...value, editable_profile, profile_text_issues: inspectProfileTextWorkingInput(editable_profile) };
});
export type OwnerIdentityDestinationReviewPageResult = z.infer<typeof response>;
export const identityDestinationReviewPagePayloadSchema = response;
type Page = Extract<OwnerIdentityDestinationReviewPageResult, { status: "success" }>;
type Root = Omit<Page, "collection">;
type Row = NonNullable<Page["collection"]>["blocks"][number];
export type OwnerIdentityDestinationReviewResult = OwnerWorkingPageAssemblyResult<Row, Root>;

/** One coherent private DB page; exact stored safety is preview advice, never navigation permission. */
export function createOwnerIdentityDestinationReviewPageReader(client: Pick<SupabaseClient, "schema">) {
  return createOwnerPrivateWorkingPageReader(client, "resolve_current_owner_identity_destination_review_page", value => response.safeParse(value));
}
/** Full Working graph with observed destination safety; no publication readiness or globally atomic freshness. */
export function createOwnerIdentityDestinationReview(client: Pick<SupabaseClient, "auth" | "schema">) {
  return createOwnerWorkingPageAssembly<Row, Root>(client, createOwnerIdentityDestinationReviewPageReader(client), 67108864);
}
