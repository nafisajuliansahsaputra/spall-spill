import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createIdentityTextEditorUpstashBudgetTransport } from "../workspace/identity-text-editor-budget-upstash";
import { productClickBudgetScript } from "./product-click-budget";
import { publicHandleSchema } from "./locators";
import { publicIdentityOrigin } from "./identity-origin";
import { spillBrowseSchema,spillDetailSchema,spillKindSchema,spillQuerySchema,spillCursorSchema,compareSpillPosition,type SpillCursor } from "./spill-contract";
export function publicSpillAvailable(){return process.env.SPALL_PUBLIC_SPILL_ENABLED==="true"&&process.env.SPALL_PUBLIC_IDENTITY_ENABLED==="true"&&process.env.SPALL_PUBLIC_MEDIA_ENABLED==="true"&&[process.env.SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE,process.env.SPALL_PUBLIC_MEDIA_BUDGET_NAMESPACE].every(v=>typeof v==="string"&&/^[a-z][a-z0-9-]{0,23}$/.test(v))&&publicIdentityOrigin(process.env.SPALL_PUBLIC_ORIGIN)!==null;}
async function admit(){const deployment=process.env.SPALL_PUBLIC_SPILL_BUDGET_NAMESPACE;if(!deployment||!/^[a-z][a-z0-9-]{0,23}$/.test(deployment))return false;const namespace=`public-spill-read-${deployment}`;const redis=createIdentityTextEditorUpstashBudgetTransport({namespace,origin:process.env.UPSTASH_REDIS_REST_URL??"",token:process.env.UPSTASH_REDIS_REST_TOKEN??""});const digest=createHash("sha256").update("published-spill-aggregate-v1").digest("hex"),base=`spall-identity-text-editor:${namespace}:{${digest}}`;return await redis.eval(productClickBudgetScript,[`${base}:command`,`${base}:work`],["60000","600","7800","13"])===1;}
async function execute(operation:"browse"|"detail",handle:unknown,query:object){
 const locator=publicHandleSchema.safeParse(handle);if(!locator.success)return {status:"unavailable"};if(!publicSpillAvailable())return null;
 const started=performance.now();if(!Number.isFinite(started))return null;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 let last=started;
 const current=()=>{const now=performance.now();if(!Number.isFinite(now)||now<last||now>=started+5000)controller.abort();last=now;return !controller.signal.aborted;};
 try{return await Promise.race([(async()=>{if(!await admit()||!current())return null;const client=createSupabaseServiceClient((input,init)=>fetch(input,{...init,cache:"no-store",redirect:"error"}));const reply=await client.schema("api").rpc("execute_public_spill_server",{input_operation:operation,input_handle:locator.data,input_query:query}).abortSignal(controller.signal);if(!current()||reply.error||Buffer.byteLength(JSON.stringify(reply.data),"utf8")>131072)return null;return reply.data as unknown;})(),new Promise<null>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},5000);})]);}catch{return null;}finally{clearTimeout(timer);controller.abort();}
}
const unavailable=(value:unknown)=>typeof value==="object"&&value!==null&&Object.keys(value).length===1&&(value as {status:unknown}).status==="unavailable";
export async function readPublicSpill(handle:unknown,q:unknown,kind:unknown,cursor:SpillCursor|null=null){
 const query=spillQuerySchema.safeParse(q),type=spillKindSchema.safeParse(kind),before=spillCursorSchema.nullable().safeParse(cursor);
 if(!query.success||!type.success||!before.success||before.data&&(before.data.q!==query.data||before.data.kind!==type.data))return null;
 const result=await execute("browse",handle,{q:query.data,kind:type.data,cursor:before.data});if(unavailable(result))return {status:"unavailable" as const};
 const parsed=spillBrowseSchema.safeParse(result);if(!parsed.success||parsed.data.q!==query.data||(result as {q:string}).q!==query.data||parsed.data.kind!==type.data||before.data&&!parsed.data.items.every(row=>compareSpillPosition(row,before.data!)<0))return null;return parsed.data;
}
export async function readPublicSpillDetail(handle:unknown,reference:number){if(!Number.isSafeInteger(reference)||reference<1)return null;const result=await execute("detail",handle,{reference});if(unavailable(result))return {status:"unavailable" as const};const parsed=spillDetailSchema.safeParse(result);return parsed.success&&parsed.data.detail.spill_reference===reference?parsed.data:null;}
