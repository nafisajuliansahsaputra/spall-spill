import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resourceTypeSchema } from "@/lib/onboarding/resource-draft-contract";
import { createOwnerGuardedRead } from "./owner-guarded-read";
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const raw = z.string().max(32768).refine(value => Array.from(value).length <= 16384 && value.isWellFormed() && !value.includes("\0")).nullable();
export const starterWorkingSchema = z.object({ title: raw, source_url: raw, resource_type: resourceTypeSchema.nullable() }).strict();
export const starterSaveSchema = z.object({ reference: revision, base_source_revision: revision, base_working_revision: revision.nullable(), working: starterWorkingSchema }).strict();
export const starterItemSchema = z.object({ reference: revision, kind: z.enum(["product","resource"]), source_revision: revision,
  working_revision: revision.nullable(), source_changed: z.boolean(), ...starterWorkingSchema.shape,
  published_lifecycle: z.enum(["published","hidden","archived"]).nullable(), has_primary_image: z.boolean(),
  destinations: z.array(z.object({ provider_key: z.string().min(1).max(300), destination_url: z.string().min(8).max(2048) }).strict()).max(10),
}).strict().refine(item => item.kind === "product" ? item.resource_type === null : item.resource_type !== null);
export type StarterItem = z.infer<typeof starterItemSchema>;
const success = z.object({ status: z.literal("success"), current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator","affiliate","business","personal","other"]), items: z.array(starterItemSchema).max(2),
}).strict().refine(value => new Set(value.items.map(item=>item.kind)).size === value.items.length
  && value.items.every((item,index)=> index===0 || value.items[index-1]!.reference < item.reference));
const response = z.union([success,z.object({status:z.literal("unavailable")}).strict()]);
export function createStarterRecoveryReader(client: Pick<SupabaseClient,"auth"|"schema">) {
  return createOwnerGuardedRead<z.infer<typeof success>>(client, async signal => {
    const reply = await client.schema("api").rpc("resolve_current_owner_starter_recovery").abortSignal(signal);
    if (reply.error || signal.aborted || Buffer.byteLength(JSON.stringify(reply.data),"utf8")>1048576) return null;
    const parsed=response.safeParse(reply.data);return parsed.success && parsed.data.status==="success" ? parsed.data : null;
  }, (context,value)=>context.current_handle===value.current_handle && context.primary_use_case===value.primary_use_case);
}
const acknowledgment = z.object({ status:z.literal("success"),reference:revision,source_revision:revision,working_revision:revision }).strict();
/** Bounded current-session mutation with before/after actor and Owner proofs,
 * exact CAS acknowledgment, and uncertain-outcome reconciliation. */
export async function saveStarterWorking(client: Pick<SupabaseClient,"auth"|"schema">, input: unknown) {
  const parsed=starterSaveSchema.safeParse(input);if(!parsed.success)return {status:"invalid_working"} as const;
  const controller=new AbortController();let dispatched=false;let timer:ReturnType<typeof setTimeout>|undefined;
  const failure=()=>({status:dispatched?"outcome_unknown":"unavailable"} as const);
  try { return await Promise.race([(async()=>{
    const before=await client.auth.getClaims();if(before.error || !z.string().uuid().safeParse(before.data?.claims?.sub).success)return {status:"unavailable"} as const;
    const state=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);
    const active=z.object({status:z.literal("active"),owner_id:z.string().uuid(),account_state:z.literal("active"),onboarding_completed:z.literal(true)}).strict();
    const first=active.safeParse(state.data);if(state.error || !first.success || controller.signal.aborted)return failure();
    dispatched=true;
    const reply=await client.schema("api").rpc("save_current_owner_starter_item_working",{input_working:parsed.data}).abortSignal(controller.signal);
    const ack=acknowledgment.safeParse(reply.data);
    if(reply.error || !ack.success || controller.signal.aborted || ack.data.reference!==parsed.data.reference
      || ack.data.source_revision!==parsed.data.base_source_revision || ack.data.working_revision!==(parsed.data.base_working_revision??0)+1)return failure();
    const after=await client.auth.getClaims();if(after.error || after.data?.claims?.sub!==before.data?.claims?.sub || controller.signal.aborted)return failure();
    const final=await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);const checked=active.safeParse(final.data);
    return !controller.signal.aborted && !final.error && checked.success && checked.data.owner_id===first.data.owner_id ? ack.data : failure();
  })(),new Promise<ReturnType<typeof failure>>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(failure());},5000);})]); }
  catch{return failure();}finally{clearTimeout(timer);}
}
