import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
import { resourceTypeSchema } from "@/lib/onboarding/resource-draft-contract";
import { starterItemSchema } from "./starter-recovery";
import { createOwnerGuardedRead } from "./owner-guarded-read";
const revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const uuid=z.string().uuid();
const canonicalTitle=z.string().max(32768).nullable().transform(v=>v===null?null:v.trim()||null)
 .refine(v=>v===null||(Array.from(v).length<=160&&!/[\u0000-\u001f\u007f]/.test(v)&&v.isWellFormed()));
const canonicalSource=z.string().max(32768).nullable().transform((v,ctx)=>{
 if(v===null||v.trim()==="")return null;
 try{const normalized=normalizeExternalDestination(v.trim()).normalizedUrl;if(normalized.length>2048)throw Error("Source too long");return normalized;}catch{ctx.addIssue({code:"custom",message:"Use an ordinary public HTTP or HTTPS source."});return z.NEVER;}
});
export const resourceCreationSchema=z.object({creation_id:uuid,resource_type:resourceTypeSchema,title:canonicalTitle,source_url:canonicalSource}).strict()
 .refine(v=>v.title!==null||v.source_url!==null);
const context={status:z.literal("success"),current_handle:z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),primary_use_case:z.enum(["creator","affiliate","business","personal","other"])};
const managerItem=z.object({reference:revision,kind:z.enum(["product","resource"]),title_preview:z.string().max(320).nullable(),
 resource_type:resourceTypeSchema.nullable(),working_revision:revision.nullable(),source_changed:z.boolean(),published_lifecycle:z.enum(["published","hidden","archived"]).nullable()}).strict()
 .refine(v=>v.kind==="resource"?v.resource_type!==null:v.resource_type===null);
export const managerSchema=z.object({...context,items:z.array(managerItem).max(20),has_more:z.boolean(),next_before_reference:revision.nullable()}).strict()
 .refine(v=>v.items.every((item,i)=>i===0||item.reference<v.items[i-1]!.reference)
 &&(v.has_more?v.items.length===20&&v.next_before_reference===v.items.at(-1)!.reference:v.next_before_reference===null));
const itemSchema=z.object({...context,item:starterItemSchema.nullable()}).strict();
export function createResourceCatalogReader(client:Pick<SupabaseClient,"auth"|"schema">,reference:number|null,exact=false){
 if(reference!==null&&!revision.safeParse(reference).success)throw Error("Invalid reference");
 if(exact&&reference===null)throw Error("Missing reference");
 const observe=async(signal:AbortSignal)=>{
  const reply=await client.schema("api").rpc(exact?"resolve_current_owner_item_recovery":"resolve_current_owner_spill_manager",{input_reference:reference}).abortSignal(signal);
  if(reply.error||signal.aborted||Buffer.byteLength(JSON.stringify(reply.data),"utf8")>1048576)return null;
  if(exact){const parsed=itemSchema.safeParse(reply.data);return parsed.success&&(parsed.data.item===null||parsed.data.item.reference===reference)?parsed.data:null;}
  const parsed=managerSchema.safeParse(reply.data);return parsed.success&&parsed.data.items.every(item=>reference===null||item.reference<reference)?parsed.data:null;
 };
 return createOwnerGuardedRead<z.infer<typeof managerSchema>|z.infer<typeof itemSchema>>(client,observe,(a,b)=>a.current_handle===b.current_handle&&a.primary_use_case===b.primary_use_case);
}
const acknowledgment=z.object({status:z.literal("success"),creation_id:uuid,reference:revision,resource_type:resourceTypeSchema,title:z.string().nullable(),source_url:z.string().nullable()}).strict();
const active=z.object({status:z.literal("active"),owner_id:uuid,account_state:z.literal("active"),onboarding_completed:z.literal(true)}).strict();
export async function createResourceDraft(client:Pick<SupabaseClient,"auth"|"schema">,input:unknown){
 const parsed=resourceCreationSchema.safeParse(input);if(!parsed.success)return {status:"invalid_draft"} as const;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let dispatched=false;
 const failure=()=>({status:dispatched?"outcome_unknown":"unavailable"} as const);
 try{return await Promise.race([(async()=>{
  const before=await client.auth.getClaims();if(before.error||!uuid.safeParse(before.data?.claims?.sub).success||controller.signal.aborted)return failure();
  const state=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const first=active.safeParse(state.data);
  if(state.error||!first.success||controller.signal.aborted)return failure();
  dispatched=true;const reply=await client.schema("api").rpc("create_current_owner_resource_draft",{input_draft:parsed.data}).abortSignal(controller.signal);const ack=acknowledgment.safeParse(reply.data);
  if(reply.error||!ack.success||controller.signal.aborted||ack.data.creation_id!==parsed.data.creation_id||ack.data.title!==parsed.data.title||ack.data.source_url!==parsed.data.source_url||ack.data.resource_type!==parsed.data.resource_type)return failure();
  const after=await client.auth.getClaims();if(after.error||after.data?.claims?.sub!==before.data?.claims?.sub||controller.signal.aborted)return failure();
  const result=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const final=active.safeParse(result.data);
  return !controller.signal.aborted&&!result.error&&final.success&&final.data.owner_id===first.data.owner_id?ack.data:failure();
 })(),new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(failure());},5000);})]);}
 catch{return failure();}finally{clearTimeout(timer);controller.abort();}
}
