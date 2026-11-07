import { expect,it,vi,afterEach } from "vitest";
import { createProductDraft,productCreationSchema } from "./product-creation";
const subject="26800000-0000-4000-8000-000000000001",owner="26800000-0000-4000-8000-000000000002",key="26800000-0000-4000-8000-000000000010";
const input={creation_id:key,title:"Portfolio",source_url:null};
const context={status:"success",current_handle:"resource-owner",primary_use_case:"personal"};
function fixture(){
 let actor=subject,restricted=false;const calls:string[]=[];let changeAfter=false;let malformed=false;let payload:unknown=null;
 const client={auth:{getClaims:vi.fn(async()=>({data:{claims:{sub:actor}},error:null}))},schema:()=>({rpc:(name:string,args?:Record<string,unknown>)=>({abortSignal:async(signal:AbortSignal)=>{
  calls.push(name);if(signal.aborted)return {data:null,error:{message:"aborted"}};
  if(name==="resolve_current_owner_state")return {data:restricted?{status:"restricted",owner_id:owner,account_state:"restricted",onboarding_completed:true}:{status:"active",owner_id:owner,account_state:"active",onboarding_completed:true},error:null};
  if(name==="resolve_current_owner_home_context")return {data:context,error:null};
  if(name==="create_current_owner_product_draft"){
   if(changeAfter)actor="26800000-0000-4000-8000-000000000003";
   return {data:{status:"success",reference:3,...(args!.input_draft as object),...(malformed?{owner_id:owner}:{})},error:null};
  }
  return {data:payload,error:null};
 }})})};
 return {client:client as never,calls,setActor:(v:string)=>{actor=v;},restrict:()=>{restricted=true;},change:()=>{changeAfter=true;},malform:()=>{malformed=true;},setPayload:(p:unknown)=>{payload=p;}};
}
afterEach(()=>vi.useRealTimers());
it("creates only explicit meaningful data and validates exact acknowledgment",async()=>{
 const f=fixture();const result=await createProductDraft(f.client,input);expect(result).toEqual({status:"success",reference:3,...input});expect(f.calls).toEqual(["resolve_current_owner_state","create_current_owner_product_draft","resolve_current_owner_state"]);
});
it.each([{...input,title:null},{...input,owner_id:owner},{...input,source_url:"javascript:alert(1)"},{...input,source_url:"http://127.0.0.1/private"},{...input,title:"x".repeat(161)},{...input,source_url:`https://example.test/${"漢".repeat(300)}`}])("rejects invalid creation before any provider work %j",async value=>{
 const f=fixture();expect((await createProductDraft(f.client,value)).status).toBe("invalid_draft");expect(f.calls).toEqual([]);
});
it("canonicalizes initial fields while preserving manual Product intent",()=>{
 expect(productCreationSchema.parse({...input,title:"  My menu  ",source_url:" https://example.test "})).toEqual({...input,title:"My menu",source_url:"https://example.test/"});
});
it("denies restricted Owner before creation dispatch",async()=>{
 const f=fixture();f.restrict();expect((await createProductDraft(f.client,input)).status).toBe("unavailable");expect(f.calls).not.toContain("create_current_owner_product_draft");
});
it("actor change after commit stays unknown without retry",async()=>{
 const f=fixture();f.change();expect((await createProductDraft(f.client,input)).status).toBe("outcome_unknown");expect(f.calls.filter(x=>x==="create_current_owner_product_draft")).toHaveLength(1);
});
it("malformed acknowledgment never becomes successful creation",async()=>{
 const f=fixture();f.malform();expect((await createProductDraft(f.client,input)).status).toBe("outcome_unknown");
});
it("creation deadline cancels an unresponsive boundary",async()=>{
 vi.useFakeTimers();const f=fixture();let signal:AbortSignal|undefined;
 const client={...f.client as object,auth:{getClaims:async()=>({data:{claims:{sub:subject}},error:null})},schema:()=>({rpc:()=>({abortSignal:(s:AbortSignal)=>{signal=s;return new Promise(()=>{});}})})};
 const result=createProductDraft(client as never,input);await vi.advanceTimersByTimeAsync(5001);expect((await result).status).toBe("unavailable");expect(signal?.aborted).toBe(true);
});
