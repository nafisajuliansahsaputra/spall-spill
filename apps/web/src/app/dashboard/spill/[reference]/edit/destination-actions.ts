"use server";
import { revalidatePath } from "next/cache";
import { createProductDestinationsClient } from "@/lib/workspace/profile-editor-server";
import { parseDestinationLines,destinationWorkingSchema,saveProductDestinations } from "@/lib/workspace/product-destinations";
export type DestinationSaveState={status:"idle"|"error"|"saved"|"reload";message:string|null;revision:number|null};
export async function saveProductDestinationsAction(_previous:DestinationSaveState,form:FormData):Promise<DestinationSaveState>{
 const failure:DestinationSaveState={status:"error",message:"Use up to ten ordinary HTTP or HTTPS links, one per marketplace. Keep each link on its own line.",revision:null};
 const keys=["reference","sourceRevision","preparationRevision","destinations"];
 if(keys.some(key=>form.getAll(key).length!==1||typeof form.get(key)!=="string")||Array.from(form.keys()).some(key=>!key.startsWith("$ACTION_")&&!keys.includes(key)))return failure;
 let input;try{input=destinationWorkingSchema.parse({reference:Number(form.get("reference")),base_source_revision:Number(form.get("sourceRevision")),base_preparation_revision:form.get("preparationRevision")===""?null:Number(form.get("preparationRevision")),destinations:parseDestinationLines(String(form.get("destinations")))});}catch{return failure;}
 try{const result=await saveProductDestinations(await createProductDestinationsClient(),input);
  if(result.status==="success"){revalidatePath(`/dashboard/spill/${input.reference}/edit`);return {status:"saved",message:"Destinations saved privately. Your image and Published version stay unchanged. Links still need checks before publishing.",revision:result.preparation_revision};}
 }catch{}
 return {status:"reload",message:"We couldn’t confirm this save. Keep your links and reload saved destinations before trying again.",revision:null};
}
