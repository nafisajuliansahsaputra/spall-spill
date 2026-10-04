"use server";

import { redirectToCurrentOwnerDestination } from "@/lib/auth/action-destination";
import { createClient } from "@/lib/supabase/server";
import {
  previewReceiptSchema, previewSnapshotHashSchema, type PreviewConfirmationState,
} from "@/lib/onboarding/preview-receipt-contract";

export async function confirmPreviewAction(
  _previous: PreviewConfirmationState, formData: FormData,
): Promise<PreviewConfirmationState> {
  const failure = (message: string): PreviewConfirmationState => ({ status: "error", message, receipt: null });
  const digest = previewSnapshotHashSchema.safeParse(formData.get("snapshotHash"));
  if (!digest.success) return failure("Reload the preview before confirming it.");
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string" || !claims.claims.sub) {
    return await redirectToCurrentOwnerDestination();
  }
  const { data, error } = await supabase.schema("api").rpc("confirm_current_onboarding_preview", {
    input_snapshot_hash: digest.data,
  });
  if (error) return failure("We couldn't confirm this preview. Your work is still saved privately. Reload and try again.");
  if (data && typeof data === "object" && ["unauthenticated", "owner_missing", "owner_not_eligible", "owner_unavailable", "onboarding_complete"].includes(data.status)) {
    return await redirectToCurrentOwnerDestination();
  }
  const receipt = previewReceiptSchema.safeParse(data);
  if (!receipt.success || receipt.data.snapshot_hash !== digest.data || Date.parse(receipt.data.expires_at) <= Date.now()) {
    return failure("Your preview changed or could not be verified. Reload and review the current saved version.");
  }
  return { status: "confirmed", message: "Preview confirmed privately. Nothing has been published.", receipt: receipt.data };
}
