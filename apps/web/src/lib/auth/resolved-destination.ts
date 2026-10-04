import "server-only";
import { clearIntendedDestinationCookie, consumeIntendedDestinationCookie } from "./intended-destination-cookie";
import { resolveCurrentOwnerState } from "./owner-state";

// Shared by HTTP entry and Server Actions. null means no authoritative decision.
export async function resolveCurrentOwnerDestination(): Promise<string | null> {
  try {
    const resolution = await resolveCurrentOwnerState();
    switch (resolution.status) {
      case "unauthenticated": return "/login";
      case "owner_missing":
        await clearIntendedDestinationCookie(); return null;
      case "restricted":
      case "suspended":
        await clearIntendedDestinationCookie(); return "/dashboard/account-status";
      case "onboarding_incomplete":
        await clearIntendedDestinationCookie(); return "/onboarding";
      case "active": return await consumeIntendedDestinationCookie() ?? "/dashboard";
    }
  } catch {
    return null;
  }
}
