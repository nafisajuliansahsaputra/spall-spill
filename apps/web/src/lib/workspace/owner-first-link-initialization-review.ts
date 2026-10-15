import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerLinkBlockReview } from "./owner-link-block-review";
export type { OwnerFirstLinkInitializationReviewResult } from "./owner-link-block-review";

/** Explicit expected-absence initialization; never a fallback from addition or a read. */
export function createOwnerFirstLinkInitializationReview(client: Pick<SupabaseClient, "auth" | "schema">) {
  const review = createOwnerLinkBlockReview(client, "initialization");
  return { initialize: review.run };
}
