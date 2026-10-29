import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CANONICAL_HANDLE_PATTERN, displayNameInputSchema, bioInputSchema, starterKeySchema } from "@/lib/onboarding/validation";
import { inspectIdentityTextWorkingInput, identityTextWorkingInputSchema } from "./identity-text-working-input";
import { createOwnerIdentityReviewSnapshot, identityReviewSnapshotHashSchema, type OwnerIdentityReviewSnapshotResult } from "./owner-identity-review-snapshot";

const displayName = z.string().refine(value => {
  const parsed = displayNameInputSchema.safeParse(value);
  return value.isWellFormed() && !/[\u2028\u2029]/u.test(value) && parsed.success && parsed.data === value;
});
const bio = z.string().refine(value => {
  const parsed = bioInputSchema.safeParse(value);
  return value.isWellFormed() && parsed.success && parsed.data === value;
}).nullable();
const text = identityTextWorkingInputSchema.shape.text.unwrap().refine(value => {
  const parsed = inspectIdentityTextWorkingInput({ kind: "text", text: value });
  return value.isWellFormed() && parsed.status === "working" && parsed.issues.length === 0;
});
/** Private preview data contract. Plain strings require contextual escaping in any renderer. */
export const identityProfileTextCandidateSchema = z.object({
  current_handle: z.string().min(3).max(30).regex(CANONICAL_HANDLE_PATTERN).refine(value => value === value.trim()),
  display_name: displayName, bio, starter_key: starterKeySchema,
  blocks: z.array(z.object({ kind: z.literal("text"), text }).strict()).max(1000),
}).strict();
export type IdentityProfileTextCandidate = z.infer<typeof identityProfileTextCandidateSchema>;
type Snapshot = Extract<OwnerIdentityReviewSnapshotResult, { status: "success" }>;
type Issue = { scope: "profile"; code: "display_name_invalid" | "bio_invalid" | "source_review_required" | "profile_media_publication_pending" }
  | { scope: "source_connection"; code: "connection_publication_preparation_pending" }
  | { scope: "block"; block_id: string; code: "payload_missing" | "text_invalid" | "link_publication_preparation_pending"
    | "contact_publication_policy_pending" | "media_publication_preparation_pending" | "spill_cta_publication_eligibility_pending" };
type Review = { status: "success"; snapshot_hash: string; review_format: "identity_working_review_v1"; publication_validation: "not_assessed" };
export type OwnerIdentityPublicationCandidateResult = Exclude<OwnerIdentityReviewSnapshotResult, Snapshot>
  | { status: "invalid_candidate_request" | "stale_review" }
  | (Review & ({ assessment: "blocked"; candidate: null; issues: Issue[] }
    | { assessment: "preview_prepared"; candidate: IdentityProfileTextCandidate; issues: [] }));
const request = z.object({ expected_snapshot_hash: identityReviewSnapshotHashSchema.nullable() }).strict();

/** Bounded Profile/Text preparation from current private truth; no publication or state mutation. */
export function createOwnerIdentityPublicationCandidate(client: Pick<SupabaseClient, "auth" | "schema">) {
  const reader = createOwnerIdentityReviewSnapshot(client);
  return {
    async prepare(value: unknown): Promise<OwnerIdentityPublicationCandidateResult> {
      const parsed = request.safeParse(value);
      if (!parsed.success) return { status: "invalid_candidate_request" };
      try {
        const snapshot = await reader.read();
        if (snapshot.status !== "success") return snapshot;
        if (parsed.data.expected_snapshot_hash !== null && parsed.data.expected_snapshot_hash !== snapshot.snapshot_hash) return { status: "stale_review" };
        const issues: Issue[] = [];
        const name = displayNameInputSchema.safeParse(snapshot.editable_profile.display_name ?? "");
        const normalizedBio = bioInputSchema.safeParse(snapshot.editable_profile.bio ?? "");
        if (!name.success || !displayName.safeParse(name.data).success) issues.push({ scope: "profile", code: "display_name_invalid" });
        if (!normalizedBio.success || (normalizedBio.data !== null && !normalizedBio.data.isWellFormed())) issues.push({ scope: "profile", code: "bio_invalid" });
        if (snapshot.profile_text_state === "source_changed") issues.push({ scope: "profile", code: "source_review_required" });
        if (snapshot.profile_working.profile_asset_key !== null) issues.push({ scope: "profile", code: "profile_media_publication_pending" });
        if (snapshot.connection_source_working !== null) issues.push({ scope: "source_connection", code: "connection_publication_preparation_pending" });
        const blocks: IdentityProfileTextCandidate["blocks"] = [];
        for (const block of snapshot.collection?.blocks ?? []) {
          if (!block.is_visible) continue;
          if (block.working === null) { issues.push({ scope: "block", block_id: block.block_id, code: "payload_missing" }); continue; }
          if (block.working.kind === "text") {
            const parsedText = text.safeParse(block.working.text);
            if (!parsedText.success) issues.push({ scope: "block", block_id: block.block_id, code: "text_invalid" });
            else blocks.push({ kind: "text", text: parsedText.data });
          } else {
            const code = block.kind === "social" || block.kind === "generic_link" ? "link_publication_preparation_pending"
              : block.kind === "contact" ? "contact_publication_policy_pending"
                : block.kind === "media" ? "media_publication_preparation_pending" : "spill_cta_publication_eligibility_pending";
            issues.push({ scope: "block", block_id: block.block_id, code });
          }
        }
        const review: Review = { status: "success", snapshot_hash: snapshot.snapshot_hash,
          review_format: snapshot.review_format, publication_validation: "not_assessed" };
        if (issues.length > 0) return { ...review, assessment: "blocked", candidate: null, issues };
        const candidate = identityProfileTextCandidateSchema.safeParse({ current_handle: snapshot.current_handle,
          display_name: name.success ? name.data : null, bio: normalizedBio.success ? normalizedBio.data : null,
          starter_key: snapshot.layout_working.starter_key, blocks });
        return candidate.success ? { ...review, assessment: "preview_prepared", candidate: candidate.data, issues: [] }
          : { status: "unavailable" };
      } catch { return { status: "unavailable" }; }
    },
  };
}
