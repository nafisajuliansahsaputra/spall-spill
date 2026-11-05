import "server-only";
import { redirect } from "next/navigation";
import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { createStarterRecoveryClient } from "./profile-editor-server";
import { createStarterRecoveryReader } from "./starter-recovery";
export async function readStarterRecoveryPage() {
 const state=await resolveCurrentOwnerState();
 if(state.status==="unauthenticated")redirect("/login");
 if(state.status==="onboarding_incomplete")redirect("/onboarding");
 if(state.status==="restricted"||state.status==="suspended")redirect("/dashboard/account-status");
 if(state.status!=="active")throw new Error("Saved work unavailable");
 const result=await createStarterRecoveryReader(await createStarterRecoveryClient()).read();
 if(result.status==="unauthenticated")redirect("/login");
 if(result.status==="onboarding_incomplete")redirect("/onboarding");
 if(result.status==="restricted"||result.status==="suspended")redirect("/dashboard/account-status");
 if(result.status!=="success")throw new Error("Saved work unavailable");
 return result;
}
