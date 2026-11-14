import "server-only";
import { createHash } from "node:crypto";
import { createIdentityTextEditorUpstashBudgetTransport } from "../workspace/identity-text-editor-budget-upstash";
import { productClickBudgetScript } from "./product-click-budget";

async function admit() {
  const deployment=process.env.SPALL_PUBLIC_MEDIA_BUDGET_NAMESPACE;
  if(process.env.SPALL_PUBLIC_MEDIA_ENABLED!=="true"||!deployment||!/^[a-z][a-z0-9-]{0,23}$/.test(deployment))return false;
  const namespace=`public-media-read-${deployment}`;
  const redis=createIdentityTextEditorUpstashBudgetTransport({namespace,origin:process.env.UPSTASH_REDIS_REST_URL??"",token:process.env.UPSTASH_REDIS_REST_TOKEN??""});
  const digest=createHash("sha256").update("published-media-aggregate-v1").digest("hex");
  const base=`spall-identity-text-editor:${namespace}:{${digest}}`;
  return await redis.eval(productClickBudgetScript,[`${base}:command`,`${base}:work`],["60000","60","780","13"])===1;
}
/** Shared admission and one deadline for the entire existing Published read. */
export async function withPublishedMediaRead(work:(signal:AbortSignal,current:()=>boolean)=>Promise<Buffer|null>):Promise<Buffer|null>{
  const started=performance.now();if(!Number.isFinite(started))return null;
  const controller=new AbortController();
  const current=()=>{const now=performance.now();if(!Number.isFinite(now)||now<started||now>=started+5000)controller.abort();return !controller.signal.aborted;};
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([
    (async()=>{if(!await admit()||!current())return null;const result=await work(controller.signal,current);return current()?result:null;})(),
    new Promise<null>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},5000);}),
  ]);}catch{return null;}finally{clearTimeout(timer);controller.abort();}
}
