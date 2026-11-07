import { expect,it,vi,afterEach } from "vitest";
import { saveProductImage,createProductImageReader } from "./product-image";
const subject="26900000-0000-4000-8000-000000000001",owner="26900000-0000-4000-8000-000000000002";
const input={reference:3,base_source_revision:1,base_preparation_revision:null,primary_asset_key:"27000000-0000-4000-8000-000000000011"};
const context={status:"success",current_handle:"resource-owner",primary_use_case:"personal"};
function fixture(){
 let actor=subject,restricted=false;const calls:string[]=[];let changeAfter=false;let malformed=false;let payload:unknown=null;
 const client={auth:{getClaims:vi.fn(async()=>({data:{claims:{sub:actor}},error:null}))},schema:()=>({rpc:(name:string,args?:Record<string,unknown>)=>({abortSignal:async(signal:AbortSignal)=>{
  calls.push(name);if(signal.aborted)return {data:null,error:{message:"aborted"}};
  if(name==="resolve_current_owner_state")return {data:restricted?{status:"restricted",owner_id:owner,account_state:"restricted",onboarding_completed:true}:{status:"active",owner_id:owner,account_state:"active",onboarding_completed:true},error:null};
  if(name==="resolve_current_owner_home_context")return {data:context,error:null};
  if(name==="save_current_owner_product_image"){
   if(changeAfter)actor="26800000-0000-4000-8000-000000000003";
   return {data:{status:"success",reference:3,source_revision:1,preparation_revision:1,primary_asset_key:(args!.input_working as typeof input).primary_asset_key,...(malformed?{owner_id:owner}:{})},error:null};
  }
  return {data:payload,error:null};
 }})})};
 return {client:client as never,calls,setActor:(v:string)=>{actor=v;},restrict:()=>{restricted=true;},change:()=>{changeAfter=true;},malform:()=>{malformed=true;},setPayload:(p:unknown)=>{payload=p;}};
}
afterEach(()=>vi.useRealTimers());
it("saves only the exact image selection after stable Owner proofs",async()=>{
 const f=fixture();const result=await saveProductImage(f.client,input);expect(result).toEqual({status:"success",reference:3,source_revision:1,preparation_revision:1,primary_asset_key:input.primary_asset_key});expect(f.calls).toEqual(["resolve_current_owner_state","save_current_owner_product_image","resolve_current_owner_state"]);
});
it.each([{...input,reference:0},{...input,owner_id:owner},{...input,primary_asset_key:"not-an-asset"},{...input,base_preparation_revision:0}])("rejects invalid intent %j",async value=>{const f=fixture();expect((await saveProductImage(f.client,value)).status).toBe("invalid_working");expect(f.calls).toEqual([]);});
it("denies restricted Owner before creation dispatch",async()=>{
 const f=fixture();f.restrict();expect((await saveProductImage(f.client,input)).status).toBe("unavailable");expect(f.calls).not.toContain("save_current_owner_product_image");
});
it("actor change after commit stays unknown without retry",async()=>{
 const f=fixture();f.change();expect((await saveProductImage(f.client,input)).status).toBe("outcome_unknown");expect(f.calls.filter(x=>x==="save_current_owner_product_image")).toHaveLength(1);
});
it("malformed acknowledgment never becomes successful creation",async()=>{
 const f=fixture();f.malform();expect((await saveProductImage(f.client,input)).status).toBe("outcome_unknown");
});
it("creation deadline cancels an unresponsive boundary",async()=>{
 vi.useFakeTimers();const f=fixture();let signal:AbortSignal|undefined;
 const client={...f.client as object,auth:{getClaims:async()=>({data:{claims:{sub:subject}},error:null})},schema:()=>({rpc:()=>({abortSignal:(s:AbortSignal)=>{signal=s;return new Promise(()=>{});}})})};
 const result=saveProductImage(client as never,input);await vi.advanceTimersByTimeAsync(5001);expect((await result).status).toBe("unavailable");expect(signal?.aborted).toBe(true);
});

it("reader rejects a wrong reference rather than exposing another Item",async()=>{const f=fixture();f.setPayload({...context,reference:99,source_revision:1,preparation_revision:null,primary_asset_key:null});expect((await createProductImageReader(f.client,3).read()).status).toBe("unavailable");});
it("guarded destination reader validates two identical observations",async()=>{const f=fixture();const data={...context,reference:3,source_revision:1,preparation_revision:null,primary_asset_key:null};f.setPayload(data);expect(await createProductImageReader(f.client,3).read()).toEqual(data);expect(f.calls.filter(x=>x==="resolve_current_owner_product_image")).toHaveLength(2);});
