import "server-only";
import { z } from "zod";
import { resolveProfileMediaAuthPrincipal } from "./auth";
import { initiateCanonicalMediaUpload,type ProfileMediaUploadInitiationInput } from "./initiation";
import { finalizeCanonicalMediaUpload } from "./finalization";
import { createProductMediaUploadIntent,resolveProductMediaUploadIntent,completeProductMediaUpload } from "./database";
const reference=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export async function initiateProductMediaUpload(input:ProfileMediaUploadInitiationInput&{reference:number}){
 if(!reference.safeParse(input.reference).success)return {status:"internal_error"} as const;
 const before=await resolveProfileMediaAuthPrincipal();if(before.status!=="authenticated")return {status:"unauthenticated"} as const;
 const result=await initiateCanonicalMediaUpload(input,args=>{
  if(args.authUserId!==before.authUserId)throw Error("Product media actor changed");return createProductMediaUploadIntent({...args,reference:input.reference});
 });
 const after=await resolveProfileMediaAuthPrincipal();return after.status==="authenticated"&&after.authUserId===before.authUserId?result:{status:"internal_error"} as const;
}
export async function finalizeProductMediaUpload(input:{reference:number;uploadIntentId:string}){
 if(!reference.safeParse(input.reference).success||!z.string().uuid().safeParse(input.uploadIntentId).success)return {status:"internal_error"} as const;
 const before=await resolveProfileMediaAuthPrincipal();if(before.status!=="authenticated")return {status:"unauthenticated"} as const;
 const check=(subject:string)=>{if(subject!==before.authUserId)throw Error("Product media actor changed");};
 const result=await finalizeCanonicalMediaUpload(input,{
  resolve:args=>{check(args.authUserId);return resolveProductMediaUploadIntent({...args,reference:input.reference});},
  complete:args=>{check(args.authUserId);return completeProductMediaUpload({...args,reference:input.reference});},
 });
 const after=await resolveProfileMediaAuthPrincipal();return after.status==="authenticated"&&after.authUserId===before.authUserId?result:{status:"internal_error"} as const;
}
