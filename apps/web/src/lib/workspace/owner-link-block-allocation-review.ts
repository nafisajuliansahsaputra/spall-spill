import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerLinkBlockReview } from "./owner-link-block-review";
export type { OwnerLinkBlockAllocationReviewResult } from "./owner-link-block-review";

/** Private allocation acknowledgment and complete current readback are separate facts. */
export function createOwnerLinkBlockAllocationReview(client: Pick<SupabaseClient, "auth" | "schema">) {
  const review = createOwnerLinkBlockReview(client, "addition");
  return { add: review.run };
}
