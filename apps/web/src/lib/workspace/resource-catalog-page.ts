import "server-only";
import { redirect } from "next/navigation";
import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { createResourceCatalogClient } from "./profile-editor-server";
import { createResourceCatalogReader, createFilteredCatalogReader } from "./resource-catalog";
import type { CatalogFilter } from "./catalog-filter";
export async function requireResourceCatalogOwner(){
 const state=await resolveCurrentOwnerState();
 if(state.status==="unauthenticated")redirect("/login");
 if(state.status==="onboarding_incomplete")redirect("/onboarding");
 if(state.status==="restricted"||state.status==="suspended")redirect("/dashboard/account-status");
 if(state.status!=="active")throw Error("Saved catalog unavailable");
}
export async function readResourceCatalogPage(reference:number|null=null,exact=false,filter?:CatalogFilter){
 await requireResourceCatalogOwner();
 const client=await createResourceCatalogClient();
 const result=await (filter?createFilteredCatalogReader(client,filter):createResourceCatalogReader(client,reference,exact)).read();
 if(result.status==="unauthenticated")redirect("/login");
 if(result.status==="onboarding_incomplete")redirect("/onboarding");
 if(result.status==="restricted"||result.status==="suspended")redirect("/dashboard/account-status");
 if(result.status!=="success")throw Error("Saved catalog unavailable");
 return result;
}
