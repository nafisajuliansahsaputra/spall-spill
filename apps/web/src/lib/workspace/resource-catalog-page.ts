import "server-only";
import { redirect } from "next/navigation";
import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { createResourceCatalogClient } from "./profile-editor-server";
import { createResourceCatalogReader } from "./resource-catalog";
export async function readResourceCatalogPage(reference:number|null=null,exact=false){
 const state=await resolveCurrentOwnerState();
 if(state.status==="unauthenticated")redirect("/login");
 if(state.status==="onboarding_incomplete")redirect("/onboarding");
 if(state.status==="restricted"||state.status==="suspended")redirect("/dashboard/account-status");
 if(state.status!=="active")throw Error("Saved catalog unavailable");
 const result=await createResourceCatalogReader(await createResourceCatalogClient(),reference,exact).read();
 if(result.status==="unauthenticated")redirect("/login");
 if(result.status==="onboarding_incomplete")redirect("/onboarding");
 if(result.status==="restricted"||result.status==="suspended")redirect("/dashboard/account-status");
 if(result.status!=="success")throw Error("Saved catalog unavailable");
 return result;
}
