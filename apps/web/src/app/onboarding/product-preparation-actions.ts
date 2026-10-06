"use server";

import { redirect } from "next/navigation";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
import { createClient } from "@/lib/supabase/server";
import { redirectToCurrentOwnerDestination } from "@/lib/auth/action-destination";
import { ensureExternalDestinationPending } from "@/lib/external-destination/safety";
import { scanAndRecordPendingExternalDestination } from "@/lib/external-destination/trusted-recorder";
import {
  marketplaceProvider, productDestinationsSchema, productImageKeySchema,
  productPreparationSuccessSchema, productRevisionSchema, type ProductPreparationActionState,
} from "@/lib/onboarding/product-preparation-contract";

export async function saveProductPreparationAction(
  _previous: ProductPreparationActionState, formData: FormData,
): Promise<ProductPreparationActionState> {
  const read = (name: string) => { const value = formData.get(name); return typeof value === "string" ? value : ""; };
  const destinations = read("marketplaceDestinations");
  const primaryAssetKey = read("productPrimaryAssetKey");
  const failure = (message: string): ProductPreparationActionState => ({ status: "error", message, destinations, primaryAssetKey });
  const baseProduct = productRevisionSchema.safeParse(Number(read("baseProductRevision")));
  const basePreparation = read("basePreparationRevision") === "" ? { success: true as const, data: null }
    : productRevisionSchema.safeParse(Number(read("basePreparationRevision")));
  const image = productImageKeySchema.nullable().safeParse(primaryAssetKey || null);
  if (!baseProduct.success || !basePreparation.success || !image.success) return failure("Reload your saved Product before preparing it.");
  let submitted: { provider_key: string; destination_url: string }[];
  try {
    const lines = destinations.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 10) throw new Error("Too many destinations.");
    submitted = lines.map((line) => {
      const { normalizedUrl } = normalizeExternalDestination(line);
      const provider = marketplaceProvider(normalizedUrl);
      if (!provider) throw new Error("Invalid destination.");
      return { provider_key: provider, destination_url: normalizedUrl };
    });
    if (!productDestinationsSchema.safeParse(submitted).success) throw new Error("Duplicate provider.");
  } catch {
    return failure("Use ordinary external http:// or https:// links, with one destination per marketplace. Keep additional links on separate lines.");
  }
  let response: { data: unknown; error: unknown };
  try {
    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || typeof claims?.claims?.sub !== "string" || !claims.claims.sub) {
      response = { data: { status: "unauthenticated" }, error: null };
    } else {
      response = await supabase.schema("api").rpc("save_current_product_preparation", {
        input_primary_asset_key: image.data, input_destinations: submitted,
        base_product_revision: baseProduct.data, base_preparation_revision: basePreparation.data,
      });
    }
  } catch { return failure("We couldn't confirm this save. Reload to check your last saved Product preparation."); }
  const status = response.data && typeof response.data === "object" && "status" in response.data ? response.data.status : null;
  if (["unauthenticated", "owner_missing", "owner_not_eligible"].includes(String(status))) {
    return await redirectToCurrentOwnerDestination();
  }
  if (status === "stale_write") return failure("Your Product changed in another tab or session. Reload before saving again.");
  if (status === "invalid_image") return failure("Upload and finish processing an image before selecting it. Your saved image has not changed.");
  const parsed = productPreparationSuccessSchema.safeParse(response.data);
  const saved = parsed.success ? parsed.data.preparation : null;
  if (response.error || !saved || !parsed.success || parsed.data.product_revision !== baseProduct.data
    || saved.revision !== (basePreparation.data ?? 0) + 1 || saved.primary_asset_key !== image.data
    || JSON.stringify(saved.destinations) !== JSON.stringify(submitted)) {
    return failure("We couldn't verify this save. Reload to check your saved Product preparation.");
  }
  for (const destination of saved.destinations) {
    try {
      const pending = await ensureExternalDestinationPending(destination.destination_url);
      if (pending.requiresScan) await scanAndRecordPendingExternalDestination(pending);
    } catch { /* A committed private save never certifies destination safety. */ }
  }
  redirect("/onboarding?step=relevant_first_job");
}
