import "server-only";
import { z } from "zod";
import { identityProfileTextCandidateSchema } from "./owner-identity-publication-candidate";
import { identityReviewSnapshotHashSchema } from "./owner-identity-review-snapshot";

const receiptId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
/** Dormant RPC intent. Content and Owner are always resolved inside the DB. */
export const ownerProfileTextDbCandidateIntentSchema = z.object({
  action: z.literal("prepare_identity_profile_text_candidate"),
  receipt_id: receiptId,
  snapshot_hash: identityReviewSnapshotHashSchema,
}).strict();
const issue = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("profile"), code: z.enum(["display_name_invalid", "bio_invalid", "source_review_required", "profile_media_publication_pending"]) }).strict(),
  z.object({ scope: z.literal("source_connection"), code: z.literal("connection_publication_preparation_pending") }).strict(),
  z.object({ scope: z.literal("block"), block_id: receiptId, code: z.enum(["payload_missing", "text_invalid", "link_publication_preparation_pending",
    "contact_publication_policy_pending", "media_publication_preparation_pending", "spill_cta_publication_eligibility_pending"]) }).strict(),
]);
const review = z.object({
  status: z.literal("success"), receipt_id: receiptId, snapshot_hash: identityReviewSnapshotHashSchema,
  expires_at: z.iso.datetime({ offset: true }), review_format: z.literal("identity_working_review_v1"),
  publication_validation: z.literal("profile_text_subset"),
});
/** Wire decoder only: not session proof, freshness proof or permission to publish. */
export const ownerProfileTextDbCandidateResultSchema = z.union([
  z.object({ status: z.enum(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable",
    "invalid_candidate_request", "stale_review", "review_expired"]) }).strict(),
  review.extend({ assessment: z.literal("blocked"), candidate: z.null(), issues: z.array(issue).min(1).max(1005) }).strict(),
  review.extend({ assessment: z.literal("candidate_validated"), candidate: identityProfileTextCandidateSchema, issues: z.tuple([]) }).strict(),
]);
export type OwnerProfileTextDbCandidateIntent = z.infer<typeof ownerProfileTextDbCandidateIntentSchema>;
export type OwnerProfileTextDbCandidateResult = z.infer<typeof ownerProfileTextDbCandidateResultSchema>;
