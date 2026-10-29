import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { persistedIdentityWorkingPageSchema } from "./owner-persisted-identity-working";
import { profileTextWorkingInputSchema, inspectProfileTextWorkingInput } from "./profile-text-working-input";
import { inspectTypedIdentityWorkingPayloadIssues } from "./owner-typed-blocks-working-page";
import { createOwnerPrivateWorkingPageReader } from "./owner-private-working-page-reader";
import { createOwnerWorkingPageAssembly, type OwnerWorkingPageAssemblyResult } from "./owner-working-page-assembly";
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const success = persistedIdentityWorkingPageSchema.safeExtend({
  profile_text_working: profileTextWorkingInputSchema.extend({ revision, source_profile_revision: revision }).strict().nullable(),
  profile_text_state: z.enum(["source", "saved", "source_changed"]),
  revision_vector: persistedIdentityWorkingPageSchema.shape.revision_vector.extend({ profile_text: revision.nullable() }).strict(),
}).refine(value => value.revision_vector.profile_text === (value.profile_text_working?.revision ?? null)
  && value.profile_text_state === (value.profile_text_working === null ? "source"
    : value.profile_text_working.source_profile_revision === value.profile_working.revision ? "saved" : "source_changed"));
const response = z.discriminatedUnion("status", [success,
  z.object({ status: z.enum(["unavailable", "invalid_page_request", "stale_read"]) }).strict(),
]).transform(value => {
  if (value.status !== "success") return value;
  const text = value.profile_text_working ?? value.profile_working;
  const editable_profile = { display_name: text.display_name, bio: text.bio, profile_asset_key: value.profile_working.profile_asset_key };
  return { ...value, editable_profile, profile_text_issues: inspectProfileTextWorkingInput(editable_profile),
    collection: value.collection === null ? null : { ...value.collection,
      blocks: value.collection.blocks.map(row => ({ ...row, issues: inspectTypedIdentityWorkingPayloadIssues(row.working) })),
    } };
});
export type OwnerEditableIdentityWorkingPageResult = z.infer<typeof response>;
type Page = Extract<OwnerEditableIdentityWorkingPageResult, { status: "success" }>;
type Root = Omit<Page, "collection">;
type Row = NonNullable<Page["collection"]>["blocks"][number];
export type OwnerEditableIdentityWorkingResult = OwnerWorkingPageAssemblyResult<Row, Root>;
/** Private single-page snapshot; source_changed retains work and requires explicit review. */
export function createOwnerEditableIdentityWorkingPageReader(client: Pick<SupabaseClient, "schema">) {
  return createOwnerPrivateWorkingPageReader(client, "resolve_current_owner_editable_identity_working_page", value => response.safeParse(value));
}
/** Guarded recoverable text plus known-persisted parts; not full D02 or Publish authority. */
export function createOwnerEditableIdentityWorking(client: Pick<SupabaseClient, "auth" | "schema">) {
  return createOwnerWorkingPageAssembly<Row, Root>(client, createOwnerEditableIdentityWorkingPageReader(client), 67108864);
}
