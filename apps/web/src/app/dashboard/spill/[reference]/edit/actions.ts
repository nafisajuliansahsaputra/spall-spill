"use server";
import { revalidatePath } from "next/cache";
import { starterSaveSchema,saveStarterWorking } from "@/lib/workspace/starter-recovery";
import { createStarterRecoveryClient } from "@/lib/workspace/profile-editor-server";
export type ItemSaveState={status:"idle"|"saved"|"error"|"reload";message:string|null;revision:number|null};
export async function saveStarterItemAction(_previous:ItemSaveState,form:FormData):Promise<ItemSaveState>{
 const number=(key:string)=>{const value=form.get(key);return typeof value==="string"&&/^[1-9][0-9]{0,15}$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null;};
 const base=number("workingRevision");
 const invalid:ItemSaveState={status:"error",message:"Check the field sizes and saved revision before trying again.",revision:base};
 if(["reference","sourceRevision","workingRevision","title","sourceUrl","resourceType"].some(key=>typeof form.get(key)!=="string")
  || Array.from(form.keys()).some(key=>!key.startsWith("$ACTION_")&&!["reference","sourceRevision","workingRevision","title","sourceUrl","resourceType"].includes(key))
  || (form.get("workingRevision")!==""&&base===null))return invalid;
 const parsed=starterSaveSchema.safeParse({reference:number("reference"),base_source_revision:number("sourceRevision"),base_working_revision:base,
  working:{title:form.get("title"),source_url:form.get("sourceUrl"),resource_type:form.get("resourceType")===""?null:form.get("resourceType")}});
 if(!parsed.success)return invalid;
 try{const result=await saveStarterWorking(await createStarterRecoveryClient(),parsed.data);
  if(result.status==="success"){revalidatePath("/dashboard");revalidatePath(`/dashboard/spill/${result.reference}/edit`);return {status:"saved",message:"Working saved privately. Reference and published version stay unchanged.",revision:result.working_revision};}
 }catch{/* No rollback or success claim after an uncertain response. */}
 return {status:"reload",message:"We couldn’t confirm this save. Keep your text and reload the latest saved work before saving again.",revision:null};
}
