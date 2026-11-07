"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createProductDraft,productCreationSchema } from "@/lib/workspace/product-creation";
import { createProductCreationClient } from "@/lib/workspace/profile-editor-server";
export type ProductCreateState={status:"idle"|"error"|"reload";message:string|null};
export async function createProductDraftAction(_previous:ProductCreateState,form:FormData):Promise<ProductCreateState>{
 const keys=["creationId","title","sourceUrl"];
 const error:ProductCreateState={status:"error",message:"Add a title or an ordinary public HTTP/HTTPS source. Title: up to 160 characters."};
 if(keys.some(key=>form.getAll(key).length!==1||typeof form.get(key)!=="string")||Array.from(form.keys()).some(key=>!key.startsWith("$ACTION_")&&!keys.includes(key)))return error;
 const input=productCreationSchema.safeParse({creation_id:form.get("creationId"),title:form.get("title"),source_url:form.get("sourceUrl")});if(!input.success)return input.error.issues.some(issue=>issue.path[0]==="source_url")
  ?{status:"error",message:"Use an ordinary public HTTP or HTTPS URL, or leave the source empty and save a title."}:error;
 let result;try{result=await createProductDraft(await createProductCreationClient(),input.data);}catch{return {status:"reload",message:"We couldn’t confirm creation. Keep your text and check Spill before creating another Product."};}
 if(result.status==="success"){revalidatePath("/dashboard/spill");redirect(`/dashboard/spill/${result.reference}/edit`);}
 return {status:"reload",message:"We couldn’t confirm creation. Keep your text and check Spill before creating another Product."};
}
