import { z } from "zod";
import { CANONICAL_HANDLE_PATTERN, onboardingStepSchema, starterKeySchema } from "./validation";
import { resourceTypeSchema } from "./resource-draft-contract";
import { profileMediaAssetKeySchema } from "@/lib/profile-media/contracts";

const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const source = z.string().url().max(2048).regex(/^https?:\/\//i);
const title = z.string().min(1).max(160);
export const previewSafetySchema = z.object({
  status: z.enum(["pending", "safe", "review", "blocked"]),
  revision: revision.nullable(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
}).strict().refine((safety) => safety.status === "pending" || (safety.revision !== null && safety.expires_at !== null));
const itemIssues = z.array(z.enum(["title_missing", "source_missing", "source_not_safe", "identity_reservation_missing"]));
const itemFields = {
  spill_reference: revision.nullable(), title: title.nullable(), revision,
  safety: previewSafetySchema, validation_issues: itemIssues,
};
export const onboardingPreviewSchema = z.object({
  status: z.literal("success"), current_step: z.literal("preview_publish"),
  progress_revision: revision,
  current_handle: z.string().min(3).max(30).regex(CANONICAL_HANDLE_PATTERN),
  identity_working: z.object({
    display_name: z.string().min(1).max(80), bio: z.string().min(1).max(300).nullable(),
    profile_asset_key: profileMediaAssetKeySchema.nullable(), revision,
  }).strict(),
  layout_working: z.object({ starter_key: starterKeySchema, revision }).strict(),
  identity_validation_issues: z.array(z.enum(["connection_not_safe", "profile_media_publication_pending"])),
  connection_working: z.object({
    connection_kind: z.enum(["social", "generic_link"]), social_platform: z.string().min(1).max(40).nullable(),
    destination_url: source, revision, safety: previewSafetySchema,
  }).strict().refine((connection) => connection.connection_kind === "social"
    ? connection.social_platform !== null : connection.social_platform === null).nullable(),
  product_draft: z.object({ ...itemFields, source_url: source }).strict().nullable(),
  resource_draft: z.object({ ...itemFields, resource_type: resourceTypeSchema, source_url: source.nullable() })
    .strict().refine((draft) => draft.title !== null || draft.source_url !== null).nullable(),
  snapshot_hash: z.string().regex(/^[0-9a-f]{64}$/),
}).strict().superRefine((preview, context) => {
  const sameIssues = (actual: readonly string[], expected: readonly string[], path: (string | number)[]) => {
    if (actual.length !== expected.length || expected.some((issue) => !actual.includes(issue))) {
      context.addIssue({ code: "custom", message: "Preview eligibility does not match acknowledged content and safety.", path });
    }
  };
  const identityIssues: string[] = [];
  if (preview.identity_working.profile_asset_key !== null) identityIssues.push("profile_media_publication_pending");
  if (preview.connection_working && preview.connection_working.safety.status !== "safe") identityIssues.push("connection_not_safe");
  sameIssues(preview.identity_validation_issues, identityIssues, ["identity_validation_issues"]);
  for (const [key, draft] of [["product_draft", preview.product_draft], ["resource_draft", preview.resource_draft]] as const) {
    if (!draft) continue;
    const issues: string[] = [];
    if (draft.title === null) issues.push("title_missing");
    if (draft.source_url === null) issues.push("source_missing");
    else if (draft.safety.status !== "safe") issues.push("source_not_safe");
    if (draft.spill_reference === null) issues.push("identity_reservation_missing");
    sameIssues(draft.validation_issues, issues, [key, "validation_issues"]);
  }
});
export const onboardingPreviewPayloadSchema = z.union([
  onboardingPreviewSchema,
  z.object({ status: z.enum(["unauthenticated", "owner_missing", "owner_unavailable", "onboarding_complete", "progress_missing"]) }).strict(),
  z.object({ status: z.literal("step_not_available"), current_step: onboardingStepSchema }).strict(),
  z.object({ status: z.literal("prerequisite_missing"), prerequisite: z.enum([
    "primary_use_case", "current_handle", "identity_working", "identity_layout_working",
  ]) }).strict(),
]);
export type OnboardingPreview = z.infer<typeof onboardingPreviewSchema>;
