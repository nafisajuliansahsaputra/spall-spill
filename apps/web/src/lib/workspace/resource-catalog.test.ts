import { expect,it,vi,afterEach } from "vitest";
import { createResourceDraft,createResourceCatalogReader,createFilteredCatalogReader,resourceCreationSchema,managerSchema } from "./resource-catalog";
const subject="26700000-0000-4000-8000-000000000001",owner="26700000-0000-4000-8000-000000000002",key="26700000-0000-4000-8000-000000000010";
const input={creation_id:key,resource_type:"portfolio",title:"Portfolio",source_url:null};
const context={status:"success",current_handle:"resource-owner",primary_use_case:"personal"};
const row={reference:3,kind:"resource",title_preview:"Private Resource",resource_type:"portfolio",working_revision:null,source_changed:false,published_lifecycle:null};
function fixture(){
 let actor=subject,restricted=false;const calls:string[]=[];let changeAfter=false;let malformed=false;let payload:unknown={...context,items:[row],has_more:false,next_before_reference:null};
 const client={auth:{getClaims:vi.fn(async()=>({data:{claims:{sub:actor}},error:null}))},schema:()=>({rpc:(name:string,args?:Record<string,unknown>)=>({abortSignal:async(signal:AbortSignal)=>{
  calls.push(name);if(signal.aborted)return {data:null,error:{message:"aborted"}};
  if(name==="resolve_current_owner_state")return {data:restricted?{status:"restricted",owner_id:owner,account_state:"restricted",onboarding_completed:true}:{status:"active",owner_id:owner,account_state:"active",onboarding_completed:true},error:null};
  if(name==="resolve_current_owner_home_context")return {data:context,error:null};
  if(name==="create_current_owner_resource_draft"){
   if(changeAfter)actor="26700000-0000-4000-8000-000000000003";
   return {data:{status:"success",reference:3,...(args!.input_draft as object),...(malformed?{owner_id:owner}:{})},error:null};
  }
  return {data:payload,error:null};
 }})})};
 return {client:client as never,calls,setActor:(v:string)=>{actor=v;},restrict:()=>{restricted=true;},change:()=>{changeAfter=true;},malform:()=>{malformed=true;},setPayload:(p:unknown)=>{payload=p;}};
}
afterEach(()=>vi.useRealTimers());
it("creates only explicit meaningful data and validates exact acknowledgment",async()=>{
 const f=fixture();const result=await createResourceDraft(f.client,input);expect(result).toEqual({status:"success",reference:3,...input});expect(f.calls).toEqual(["resolve_current_owner_state","create_current_owner_resource_draft","resolve_current_owner_state"]);
});
it.each([{...input,title:null},{...input,resource_type:"pdf"},{...input,owner_id:owner},{...input,source_url:"javascript:alert(1)"},{...input,source_url:"http://127.0.0.1/private"},{...input,title:"x".repeat(161)},{...input,source_url:`https://example.test/${"漢".repeat(300)}`}])("rejects invalid creation before any provider work %j",async value=>{
 const f=fixture();expect((await createResourceDraft(f.client,value)).status).toBe("invalid_draft");expect(f.calls).toEqual([]);
});
it("canonicalizes initial fields without inferring Resource meaning",()=>{
 expect(resourceCreationSchema.parse({...input,title:"  My menu  ",source_url:" https://example.test "})).toEqual({...input,title:"My menu",source_url:"https://example.test/"});
});
it("denies restricted Owner before creation dispatch",async()=>{
 const f=fixture();f.restrict();expect((await createResourceDraft(f.client,input)).status).toBe("unavailable");expect(f.calls).not.toContain("create_current_owner_resource_draft");
});
it("actor change after commit stays unknown without retry",async()=>{
 const f=fixture();f.change();expect((await createResourceDraft(f.client,input)).status).toBe("outcome_unknown");expect(f.calls.filter(x=>x==="create_current_owner_resource_draft")).toHaveLength(1);
});
it("malformed acknowledgment never becomes successful creation",async()=>{
 const f=fixture();f.malform();expect((await createResourceDraft(f.client,input)).status).toBe("outcome_unknown");
});
it("bounded read uses repeated current-session/context proofs",async()=>{
 const f=fixture();const result=await createResourceCatalogReader(f.client,null).read();expect(result).toEqual({...context,items:[row],has_more:false,next_before_reference:null});
 expect(f.calls.filter(x=>x==="resolve_current_owner_spill_manager")).toHaveLength(2);
});
it.each([{...context,items:[row,row],has_more:false,next_before_reference:null},{...context,items:[row],has_more:true,next_before_reference:3},{...context,items:[row],has_more:false,next_before_reference:3},{...context,items:[{...row,source_url:"private"}],has_more:false,next_before_reference:null}])("rejects malformed manager proof %j",async payload=>{
 const f=fixture();f.setPayload(payload);expect((await createResourceCatalogReader(f.client,null).read()).status).toBe("unavailable");
});
it("rejects rows outside the requested continuation window",async()=>{
 const f=fixture();expect((await createResourceCatalogReader(f.client,3).read()).status).toBe("unavailable");
});
it("empty manager is a valid guarded state",()=>expect(managerSchema.safeParse({...context,items:[],has_more:false,next_before_reference:null}).success).toBe(true));
it("unknown exact reference is a valid private not-found, not catalog leakage",async()=>{
 const f=fixture();f.setPayload({...context,item:null});expect(await createResourceCatalogReader(f.client,9,true).read()).toEqual({...context,item:null});
});
it("creation deadline cancels an unresponsive boundary",async()=>{
 vi.useFakeTimers();const f=fixture();let signal:AbortSignal|undefined;
 const client={...f.client as object,auth:{getClaims:async()=>({data:{claims:{sub:subject}},error:null})},schema:()=>({rpc:()=>({abortSignal:(s:AbortSignal)=>{signal=s;return new Promise(()=>{});}})})};
 const result=createResourceDraft(client as never,input);await vi.advanceTimersByTimeAsync(5001);expect((await result).status).toBe("unavailable");expect(signal?.aborted).toBe(true);
});

const filter={q:"Private",kind:"resource" as const,lifecycle:"draft" as const,before:null};
it("reads a twice-observed normalized filter-bound catalog with current actor proof",async()=>{const f=fixture();f.setPayload({...context,filter,items:[row],has_more:false,next_before_reference:null});expect((await createFilteredCatalogReader(f.client,filter).read()).status).toBe("success");expect(f.calls.filter(x=>x==="resolve_current_owner_spill_manager_filtered")).toHaveLength(2);});
it.each([
 {filter:{...filter,q:"other"}}, {filter:{...filter,q:" Private "}}, {filter:{...filter,owner_id:owner}},
 {items:[{...row,kind:"product",resource_type:null}]}, {items:[{...row,published_lifecycle:"published"}]},
 {items:[{...row,source_url:"private"}]}, {items:[row,row]},
])("rejects filter/binding/scope/shape drift %j",async change=>{const f=fixture();f.setPayload({...context,filter,items:[row],has_more:false,next_before_reference:null,...change});expect((await createFilteredCatalogReader(f.client,filter).read()).status).toBe("unavailable");});
it("does not dispatch filtered reads for a restricted actor",async()=>{const f=fixture();f.restrict();expect((await createFilteredCatalogReader(f.client,filter).read()).status).toBe("restricted");expect(f.calls).not.toContain("resolve_current_owner_spill_manager_filtered");});

it("rejects wrong or malformed exact-reference results despite matching filter echo",async()=>{for(const q of ["#4","#01","9007199254740992"]){const f=fixture();const exact={...filter,q};f.setPayload({...context,filter:exact,items:[row],has_more:false,next_before_reference:null});expect((await createFilteredCatalogReader(f.client,exact).read()).status).toBe("unavailable");}});
