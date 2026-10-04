import "server-only";
import { createClient } from "@/lib/supabase/server";
import { OnboardingStateResolutionError } from "./state";
import { onboardingPreviewPayloadSchema } from "./preview-contract";

export async function resolveCurrentOnboardingPreview() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string" || !claims.claims.sub) {
    return { status: "unauthenticated" } as const;
  }
  const { data, error } = await supabase.schema("api").rpc("resolve_current_onboarding_preview");
  const result = onboardingPreviewPayloadSchema.safeParse(data);
  if (error || !result.success || result.data.status === "unauthenticated") {
    throw new OnboardingStateResolutionError("Authoritative onboarding preview could not be verified.");
  }
  return result.data;
}
