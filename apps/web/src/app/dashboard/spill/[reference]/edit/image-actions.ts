"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { initiateProductMediaUpload,finalizeProductMediaUpload } from "@/lib/profile-media/product-upload";
import { profileMediaSourceContentTypeSchema,profileMediaDeclaredByteSizeSchema } from "@/lib/profile-media/contracts";
import { createProductImageClient } from "@/lib/workspace/profile-editor-server";
import { imageWorkingSchema,saveProductImage } from "@/lib/workspace/product-image";
const reference=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const initiation=z.object({reference,contentType:profileMediaSourceContentTypeSchema,declaredByteSize:profileMediaDeclaredByteSizeSchema}).strict();
const finalization=z.object({reference,uploadIntentId:z.string().uuid()}).strict();
export async function initiateProductImageAction(input:unknown){
 const parsed=initiation.safeParse(input);if(!parsed.success)return {status:"internal_error"} as const;
 try{const result=await initiateProductMediaUpload(parsed.data);if(result.status==="success"||result.status==="invalid_content_type"||result.status==="invalid_byte_size")return result;}catch{}
 return {status:"internal_error"} as const;
}
export async function finalizeProductImageAction(input:unknown){
 const parsed=finalization.safeParse(input);if(!parsed.success)return {status:"internal_error"} as const;
 try{const result=await finalizeProductMediaUpload(parsed.data);if(result.status==="success"||result.status==="intent_missing"||result.status==="processing"||result.status==="expired"||result.status==="rejected"||result.status==="invalid_upload_intent")return result;}catch{}
 return {status:"internal_error"} as const;
}
export type ImageSaveState={status:"idle"|"error"|"saved"|"reload";message:string|null;revision:number|null};
export async function saveProductImageAction(_previous:ImageSaveState,form:FormData):Promise<ImageSaveState>{
 const error:ImageSaveState={status:"error",message:"Reload the Product and choose a processed image before saving.",revision:null};
 const keys=["reference","sourceRevision","preparationRevision","assetKey"];
 if(keys.some(key=>form.getAll(key).length!==1||typeof form.get(key)!=="string")||Array.from(form.keys()).some(key=>!key.startsWith("$ACTION_")&&!keys.includes(key)))return error;
 const parsed=imageWorkingSchema.safeParse({reference:Number(form.get("reference")),base_source_revision:Number(form.get("sourceRevision")),base_preparation_revision:form.get("preparationRevision")===""?null:Number(form.get("preparationRevision")),primary_asset_key:form.get("assetKey")===""?null:form.get("assetKey")});if(!parsed.success)return error;
 try{const result=await saveProductImage(await createProductImageClient(),parsed.data);if(result.status==="success"){revalidatePath(`/dashboard/spill/${parsed.data.reference}/edit`);return {status:"saved",message:"Image selection saved privately. Destinations and Published content stay unchanged.",revision:result.preparation_revision};}}catch{}
 return {status:"reload",message:"We couldn’t confirm this image save. Keep your selection and reload saved media before trying again.",revision:null};
}
