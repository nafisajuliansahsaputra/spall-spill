"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createResourceDraft,resourceCreationSchema } from "@/lib/workspace/resource-catalog";
import { createResourceCatalogClient } from "@/lib/workspace/profile-editor-server";
export type ResourceCreateState={status:"idle"|"error"|"reload";message:string|null};
export async function createResourceDraftAction(_previous:ResourceCreateState,form:FormData):Promise<ResourceCreateState>{
 const keys=["creationId","resourceType","title","sourceUrl"];
 const error:ResourceCreateState={status:"error",message:"Choose a Resource type and add a title or an ordinary public HTTP/HTTPS source. Title: up to 160 characters."};
 if(keys.some(key=>form.getAll(key).length!==1||typeof form.get(key)!=="string")||Array.from(form.keys()).some(key=>!key.startsWith("$ACTION_")&&!keys.includes(key)))return error;
 const input=resourceCreationSchema.safeParse({creation_id:form.get("creationId"),resource_type:form.get("resourceType"),title:form.get("title"),source_url:form.get("sourceUrl")});if(!input.success)return input.error.issues.some(issue=>issue.path[0]==="source_url")
  ?{status:"error",message:"Use an ordinary public HTTP or HTTPS URL, or leave the source empty and save a title."}:error;
 let result;try{result=await createResourceDraft(await createResourceCatalogClient(),input.data);}catch{return {status:"reload",message:"We couldn’t confirm creation. Keep your text and check Spill before creating another Resource."};}
 if(result.status==="success"){revalidatePath("/dashboard/spill");redirect(`/dashboard/spill/${result.reference}/edit`);}
 return {status:"reload",message:"We couldn’t confirm creation. Keep your text and check Spill before creating another Resource."};
}
