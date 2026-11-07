import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
import { marketplaceProvider,productDestinationsSchema } from "@/lib/onboarding/product-preparation-contract";
import { createOwnerGuardedRead } from "./owner-guarded-read";
const revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER),uuid=z.string().uuid();
export const destinationWorkingSchema=z.object({reference:revision,base_source_revision:revision,base_preparation_revision:revision.nullable(),destinations:productDestinationsSchema}).strict();
export function parseDestinationLines(text:string){
 if(text.length>32768)throw Error("Too many destinations");
 const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);if(lines.length>10)throw Error("Too many destinations");
 return productDestinationsSchema.parse(lines.map(line=>{const {normalizedUrl}=normalizeExternalDestination(line);return {provider_key:marketplaceProvider(normalizedUrl),destination_url:normalizedUrl};}));
}
export const productDestinationsPageSchema=z.object({status:z.literal("success"),current_handle:z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),primary_use_case:z.enum(["creator","affiliate","business","personal","other"]),reference:revision,source_revision:revision,preparation_revision:revision.nullable(),destinations:productDestinationsSchema,has_primary_image:z.boolean()}).strict();
export type ProductDestinationsPage=z.infer<typeof productDestinationsPageSchema>;
export function createProductDestinationsReader(client:Pick<SupabaseClient,"auth"|"schema">,reference:number){
 if(!revision.safeParse(reference).success)throw Error("Invalid reference");
 return createOwnerGuardedRead(client,async(signal:AbortSignal)=>{
  const reply=await client.schema("api").rpc("resolve_current_owner_product_destinations",{input_reference:reference}).abortSignal(signal);
  if(reply.error||signal.aborted||Buffer.byteLength(JSON.stringify(reply.data),"utf8")>65536)return null;
  const result=productDestinationsPageSchema.safeParse(reply.data);return result.success&&result.data.reference===reference?result.data:null;
 },(context,value)=>context.current_handle===value.current_handle&&context.primary_use_case===value.primary_use_case);
}
const acknowledgment=z.object({status:z.literal("success"),reference:revision,source_revision:revision,preparation_revision:revision,destinations:productDestinationsSchema}).strict();
const active=z.object({status:z.literal("active"),owner_id:uuid,account_state:z.literal("active"),onboarding_completed:z.literal(true)}).strict();
export async function saveProductDestinations(client:Pick<SupabaseClient,"auth"|"schema">,input:unknown){
 const parsed=destinationWorkingSchema.safeParse(input);if(!parsed.success)return {status:"invalid_working"} as const;
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let dispatched=false;
 const failure=()=>({status:dispatched?"outcome_unknown":"unavailable"} as const);
 try{return await Promise.race([(async()=>{
  const before=await client.auth.getClaims();if(before.error||!uuid.safeParse(before.data?.claims?.sub).success||controller.signal.aborted)return failure();
  const state=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const first=active.safeParse(state.data);
  if(state.error||!first.success||controller.signal.aborted)return failure();
  dispatched=true;const reply=await client.schema("api").rpc("save_current_owner_product_destinations",{input_working:parsed.data}).abortSignal(controller.signal);const ack=acknowledgment.safeParse(reply.data);
  if(reply.error||!ack.success||controller.signal.aborted||ack.data.reference!==parsed.data.reference||ack.data.source_revision!==parsed.data.base_source_revision||ack.data.preparation_revision!==(parsed.data.base_preparation_revision??0)+1||JSON.stringify(ack.data.destinations)!==JSON.stringify(parsed.data.destinations))return failure();
  const after=await client.auth.getClaims();if(after.error||after.data?.claims?.sub!==before.data?.claims?.sub||controller.signal.aborted)return failure();
  const result=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const final=active.safeParse(result.data);
  return !controller.signal.aborted&&!result.error&&final.success&&final.data.owner_id===first.data.owner_id?ack.data:failure();
 })(),new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(failure());},5000);})]);}
 catch{return failure();}finally{clearTimeout(timer);controller.abort();}
}
