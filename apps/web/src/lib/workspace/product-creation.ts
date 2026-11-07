import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
const revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const uuid=z.string().uuid();
const canonicalTitle=z.string().max(32768).nullable().transform(v=>v===null?null:v.trim()||null)
 .refine(v=>v===null||(Array.from(v).length<=160&&!/[\u0000-\u001f\u007f]/.test(v)&&v.isWellFormed()));
const canonicalSource=z.string().max(32768).nullable().transform((v,ctx)=>{
 if(v===null||v.trim()==="")return null;
 try{const normalized=normalizeExternalDestination(v.trim()).normalizedUrl;if(normalized.length>2048)throw Error("Source too long");return normalized;}catch{ctx.addIssue({code:"custom",message:"Use an ordinary public HTTP or HTTPS source."});return z.NEVER;}
});
export const productCreationSchema=z.object({creation_id:uuid,title:canonicalTitle,source_url:canonicalSource}).strict()
 .refine(v=>v.title!==null||v.source_url!==null);
const acknowledgment=z.object({status:z.literal("success"),creation_id:uuid,reference:revision,title:z.string().nullable(),source_url:z.string().nullable()}).strict();
const active=z.object({status:z.literal("active"),owner_id:uuid,account_state:z.literal("active"),onboarding_completed:z.literal(true)}).strict();
export async function createProductDraft(client:Pick<SupabaseClient,"auth"|"schema">,input:unknown){
 const parsed=productCreationSchema.safeParse(input);if(!parsed.success)return {status:"invalid_draft"} as const;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let dispatched=false;
 const failure=()=>({status:dispatched?"outcome_unknown":"unavailable"} as const);
 try{return await Promise.race([(async()=>{
  const before=await client.auth.getClaims();if(before.error||!uuid.safeParse(before.data?.claims?.sub).success||controller.signal.aborted)return failure();
  const state=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const first=active.safeParse(state.data);
  if(state.error||!first.success||controller.signal.aborted)return failure();
  dispatched=true;const reply=await client.schema("api").rpc("create_current_owner_product_draft",{input_draft:parsed.data}).abortSignal(controller.signal);const ack=acknowledgment.safeParse(reply.data);
  if(reply.error||!ack.success||controller.signal.aborted||ack.data.creation_id!==parsed.data.creation_id||ack.data.title!==parsed.data.title||ack.data.source_url!==parsed.data.source_url)return failure();
  const after=await client.auth.getClaims();if(after.error||after.data?.claims?.sub!==before.data?.claims?.sub||controller.signal.aborted)return failure();
  const result=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const final=active.safeParse(result.data);
  return !controller.signal.aborted&&!result.error&&final.success&&final.data.owner_id===first.data.owner_id?ack.data:failure();
 })(),new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(failure());},5000);})]);}
 catch{return failure();}finally{clearTimeout(timer);controller.abort();}
}
