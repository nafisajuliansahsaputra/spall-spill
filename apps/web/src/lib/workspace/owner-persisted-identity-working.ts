import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerProfileWorkingSchema } from "./owner-profile-working";
import { ownerLayoutWorkingSchema, ownerConnectionWorkingSchema, ownerLegacyIdentityWorkSchema } from "./owner-composition-working";
import { typedIdentityWorkingCollectionSchema, inspectTypedIdentityWorkingPayloadIssues } from "./owner-typed-blocks-working-page";
import { createOwnerPrivateWorkingPageReader } from "./owner-private-working-page-reader";
import { createOwnerWorkingPageAssembly, type OwnerWorkingPageAssemblyResult } from "./owner-working-page-assembly";

const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const success = z.object({ status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  profile_working: ownerProfileWorkingSchema,
  layout_working: ownerLayoutWorkingSchema,
  connection_source_working: ownerConnectionWorkingSchema.nullable(),
  legacy_identity_work: ownerLegacyIdentityWorkSchema,
  publication_comparison: z.literal("not_assessed"),
  revision_vector: z.object({ profile: revision, layout: revision, connection: revision.nullable(), blocks: revision.nullable() }).strict(),
  collection: typedIdentityWorkingCollectionSchema.nullable(),
}).strict().refine(value => value.revision_vector.profile === value.profile_working.revision
  && value.revision_vector.layout === value.layout_working.revision
  && value.revision_vector.connection === (value.connection_source_working?.revision ?? null)
  && value.revision_vector.blocks === (value.collection?.revision ?? null));
const response = z.discriminatedUnion("status", [success,
  z.object({ status: z.enum(["unavailable", "invalid_page_request", "stale_read"]) }).strict(),
]).transform(value => {
  if (value.status !== "success") return value;
  if (value.collection === null) return { ...value, collection: null };
  return { ...value, collection: { ...value.collection, blocks: value.collection.blocks.map(row => ({
    ...row, issues: inspectTypedIdentityWorkingPayloadIssues(row.working),
  })) } };
});
export type OwnerPersistedIdentityWorkingPageResult = z.infer<typeof response>;
type Page = Extract<OwnerPersistedIdentityWorkingPageResult, { status: "success" }>;
type Root = Omit<Page, "collection">;
type Row = NonNullable<Page["collection"]>["blocks"][number];
export type OwnerPersistedIdentityWorkingResult = OwnerWorkingPageAssemblyResult<Row, Root>;

/** Single private page; the source slot is not silently converted into a block. */
export function createOwnerPersistedIdentityWorkingPageReader(client: Pick<SupabaseClient, "schema">) {
  return createOwnerPrivateWorkingPageReader(client, "resolve_current_owner_identity_working_page", value => response.safeParse(value));
}
/** Guarded known-persisted handoff; whole-document publication comparison stays unassessed. */
export function createOwnerPersistedIdentityWorking(client: Pick<SupabaseClient, "auth" | "schema">) {
  return createOwnerWorkingPageAssembly<Row, Root>(client, createOwnerPersistedIdentityWorkingPageReader(client), 67108864);
}
