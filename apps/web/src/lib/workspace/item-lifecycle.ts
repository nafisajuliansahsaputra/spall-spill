import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerGuardedRead } from "./owner-guarded-read";
import { lifecycleCommandSchema,lifecyclePageSchema,lifecycleAckSchema,lifecycleTarget } from "./item-lifecycle-contract";
const uuid=z.string().uuid();
const active=z.object({status:z.literal("active"),owner_id:uuid,account_state:z.literal("active"),onboarding_completed:z.literal(true)}).strict();
export function createItemLifecycleReader(client:Pick<SupabaseClient,"auth"|"schema">,reference:number){
 if(!Number.isSafeInteger(reference)||reference<1)throw Error("Invalid Item reference");
 return createOwnerGuardedRead(client,async(signal:AbortSignal)=>{
  const reply=await client.schema("api").rpc("resolve_current_owner_spill_lifecycle",{input_reference:reference}).abortSignal(signal);
  if(reply.error||signal.aborted||Buffer.byteLength(JSON.stringify(reply.data),"utf8")>4096)return null;
  const parsed=lifecyclePageSchema.safeParse(reply.data);return parsed.success&&parsed.data.reference===reference?parsed.data:null;
 },(context,value)=>context.current_handle===value.current_handle&&context.primary_use_case===value.primary_use_case);
}
export async function changeItemLifecycle(client:Pick<SupabaseClient,"auth"|"schema">,input:unknown){
 const parsed=lifecycleCommandSchema.safeParse(input);if(!parsed.success)return {status:"invalid_command"} as const;
 const command=parsed.data,target=lifecycleTarget(command.action,command.expected_lifecycle);
 if(target===null||command.expected_revision>=Number.MAX_SAFE_INTEGER)return {status:"invalid_command"} as const;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,dispatched=false;
 const failure=()=>({status:dispatched?"outcome_unknown":"unavailable"} as const);
 const start=performance.now();let last=start;
 const current=()=>{const now=performance.now();if(!Number.isFinite(start)||!Number.isFinite(now)||now<last||now>=start+5000)controller.abort();last=now;return !controller.signal.aborted;};
 const prove=async()=>{
  const proof=await client.auth.getClaims();if(proof.error||!uuid.safeParse(proof.data?.claims?.sub).success||!current())return null;
  const reply=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const state=active.safeParse(reply.data);
  return current()&&!reply.error&&state.success?{subject:proof.data!.claims!.sub,owner:state.data.owner_id}:null;
 };
 try{return await Promise.race([(async()=>{
  const before=await prove();if(!before)return failure();
  dispatched=true;const reply=await client.schema("api").rpc("change_current_owner_spill_lifecycle",{input_command:command}).abortSignal(controller.signal);
  if(!current()||reply.error||Buffer.byteLength(JSON.stringify(reply.data),"utf8")>4096)return failure();
  const denial=z.object({status:z.enum(["stale_write","review_required","revision_exhausted","conflicting_intent"])}).strict().safeParse(reply.data);
  if(denial.success){const after=await prove();return after&&after.subject===before.subject&&after.owner===before.owner?denial.data:failure();}
  const ack=lifecycleAckSchema.safeParse(reply.data);
  if(!ack.success||ack.data.intent_id!==command.intent_id||ack.data.reference!==command.reference||ack.data.revision!==command.expected_revision+1||ack.data.lifecycle!==target)return failure();
  const middle=await prove();if(!middle||middle.subject!==before.subject||middle.owner!==before.owner)return failure();
  const read=await client.schema("api").rpc("resolve_current_owner_spill_lifecycle",{input_reference:command.reference}).abortSignal(controller.signal);const fresh=lifecyclePageSchema.safeParse(read.data);
  if(!current()||read.error||!fresh.success||fresh.data.reference!==ack.data.reference||fresh.data.kind!==ack.data.kind||fresh.data.revision!==ack.data.revision||fresh.data.lifecycle!==ack.data.lifecycle)return failure();
  const after=await prove();return after&&after.subject===before.subject&&after.owner===before.owner?ack.data:failure();
 })(),new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(failure());},5000);})]);}
 catch{return failure();}finally{clearTimeout(timer);controller.abort();}
}
