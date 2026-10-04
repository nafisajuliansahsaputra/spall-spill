import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { OnboardingStateResolutionError } from "./state";
import { resourceDraftPayloadSchema } from "./resource-draft-contract";

export async function resolveCurrentResourceDraftState() {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  if (claims.error || !claims.data) return { status: "unauthenticated" } as const;
  if (!z.object({ sub: z.string().uuid() }).safeParse(claims.data.claims).success) {
    throw new OnboardingStateResolutionError("Resource Draft authentication claims are invalid.");
  }
  const { data, error } = await supabase.schema("api").rpc("resolve_current_resource_draft_state");
  const parsed = resourceDraftPayloadSchema.safeParse(data);
  if (error || !parsed.success) {
    throw new OnboardingStateResolutionError("Resource Draft resolver could not verify authoritative state.");
  }
  if (parsed.data.status === "unauthenticated") {
    throw new OnboardingStateResolutionError("Verified authentication and Resource Draft state are inconsistent.");
  }
  return parsed.data;
}
