import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerEditableIdentityWorking, type OwnerEditableIdentityWorkingResult } from "./owner-editable-identity-working";

const request = z.object({ expected_content_digest: z.string().length(64).regex(/^[0-9a-f]{64}$/).nullable() }).strict();
type Snapshot = Extract<OwnerEditableIdentityWorkingResult, { status: "success" }>;
type Dependency =
  | { scope: "identity"; code: "whole_identity_publication_validation" | "profile_source_review" | "profile_media_public_delivery" | "source_destination_safety" }
  | { scope: "block"; block_id: string; code: "payload_missing" | "destination_safety" | "contact_target_policy" | "media_public_delivery" | "public_spill_eligibility" };
export type OwnerIdentityWorkingReviewResult = Exclude<OwnerEditableIdentityWorkingResult, Snapshot>
  | { status: "invalid_review_request" | "stale_review" }
  | { status: "success"; content_digest: string; snapshot: Snapshot;
    publication_assessment: "pending"; pending_checks: Dependency[] };

/** Content comparison only: this digest is neither a receipt nor permission to publish. */
function contentDigest(snapshot: Snapshot): string {
  const content = {
    current_handle: snapshot.current_handle,
    primary_use_case: snapshot.primary_use_case,
    profile_working: snapshot.profile_working,
    profile_text_working: snapshot.profile_text_working,
    profile_text_state: snapshot.profile_text_state,
    layout_working: snapshot.layout_working,
    connection_source_working: snapshot.connection_source_working,
    revision_vector: snapshot.revision_vector,
    collection: snapshot.collection === null ? null : {
      revision: snapshot.collection.revision,
      blocks: snapshot.collection.blocks.map(row => ({
        block_id: row.block_id, kind: row.kind, position: row.position,
        is_visible: row.is_visible, payload_state: row.payload_state,
        working: row.working, media_asset_state: row.media_asset_state,
      })),
    },
  };
  return createHash("sha256").update("spall-spill:private-identity-working-review:v1\n")
    .update(JSON.stringify(content), "utf8").digest("hex");
}

function pendingChecks(snapshot: Snapshot): Dependency[] {
  const checks: Dependency[] = [{ scope: "identity", code: "whole_identity_publication_validation" }];
  if (snapshot.profile_text_state === "source_changed") checks.push({ scope: "identity", code: "profile_source_review" });
  if (snapshot.profile_working.profile_asset_key !== null) checks.push({ scope: "identity", code: "profile_media_public_delivery" });
  if (snapshot.connection_source_working !== null) checks.push({ scope: "identity", code: "source_destination_safety" });
  for (const row of snapshot.collection?.blocks ?? []) {
    if (!row.is_visible) continue;
    if (row.payload_state === "missing") checks.push({ scope: "block", block_id: row.block_id, code: "payload_missing" });
    const code = row.kind === "social" || row.kind === "generic_link" ? "destination_safety"
      : row.kind === "contact" ? "contact_target_policy"
        : row.kind === "media" ? "media_public_delivery"
          : row.kind === "spill_cta" ? "public_spill_eligibility" : null;
    if (code !== null) checks.push({ scope: "block", block_id: row.block_id, code });
  }
  return checks;
}

/** Fresh private whole-Working review. No publication, target fetch, receipt or safety inference. */
export function createOwnerIdentityWorkingReview(client: Pick<SupabaseClient, "auth" | "schema">) {
  const reader = createOwnerEditableIdentityWorking(client);
  return {
    async review(value: unknown): Promise<OwnerIdentityWorkingReviewResult> {
      const parsed = request.safeParse(value);
      if (!parsed.success) return { status: "invalid_review_request" };
      try {
        const snapshot = await reader.read();
        if (snapshot.status !== "success") return snapshot;
        const content_digest = contentDigest(snapshot);
        if (parsed.data.expected_content_digest !== null && parsed.data.expected_content_digest !== content_digest) {
          return { status: "stale_review" };
        }
        return { status: "success", content_digest, snapshot,
          publication_assessment: "pending", pending_checks: pendingChecks(snapshot) };
      } catch { return { status: "unavailable" }; }
    },
  };
}
