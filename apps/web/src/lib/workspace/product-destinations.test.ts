import { expect,it,vi,afterEach } from "vitest";
import { saveProductDestinations,parseDestinationLines,createProductDestinationsReader } from "./product-destinations";
const subject="26900000-0000-4000-8000-000000000001",owner="26900000-0000-4000-8000-000000000002";
const input={reference:3,base_source_revision:1,base_preparation_revision:null,destinations:[{provider_key:"external:shop.example.test",destination_url:"https://shop.example.test/item?tag=owner"}]};
const context={status:"success",current_handle:"resource-owner",primary_use_case:"personal"};
function fixture(){
 let actor=subject,restricted=false;const calls:string[]=[];let changeAfter=false;let malformed=false;let payload:unknown=null;
 const client={auth:{getClaims:vi.fn(async()=>({data:{claims:{sub:actor}},error:null}))},schema:()=>({rpc:(name:string,args?:Record<string,unknown>)=>({abortSignal:async(signal:AbortSignal)=>{
  calls.push(name);if(signal.aborted)return {data:null,error:{message:"aborted"}};
  if(name==="resolve_current_owner_state")return {data:restricted?{status:"restricted",owner_id:owner,account_state:"restricted",onboarding_completed:true}:{status:"active",owner_id:owner,account_state:"active",onboarding_completed:true},error:null};
  if(name==="resolve_current_owner_home_context")return {data:context,error:null};
  if(name==="save_current_owner_product_destinations"){
   if(changeAfter)actor="26800000-0000-4000-8000-000000000003";
   return {data:{status:"success",reference:3,source_revision:1,preparation_revision:1,destinations:(args!.input_working as typeof input).destinations,...(malformed?{owner_id:owner}:{})},error:null};
  }
  return {data:payload,error:null};
 }})})};
 return {client:client as never,calls,setActor:(v:string)=>{actor=v;},restrict:()=>{restricted=true;},change:()=>{changeAfter=true;},malform:()=>{malformed=true;},setPayload:(p:unknown)=>{payload=p;}};
}
afterEach(()=>vi.useRealTimers());
it("creates only explicit meaningful data and validates exact acknowledgment",async()=>{
 const f=fixture();const result=await saveProductDestinations(f.client,input);expect(result).toEqual({status:"success",reference:3,source_revision:1,preparation_revision:1,destinations:input.destinations});expect(f.calls).toEqual(["resolve_current_owner_state","save_current_owner_product_destinations","resolve_current_owner_state"]);
});
it.each([{...input,reference:0},{...input,owner_id:owner},{...input,destinations:[{provider_key:"shopee",destination_url:"https://attacker.test/"}]},{...input,base_preparation_revision:0}])("rejects invalid intent %j",async value=>{const f=fixture();expect((await saveProductDestinations(f.client,value)).status).toBe("invalid_working");expect(f.calls).toEqual([]);});
it("normalizes attribution and recognizes provider without approving safety",()=>{expect(parseDestinationLines(" HTTPS://SHOPEE.CO.ID/item?affiliate=owner ")).toEqual([{provider_key:"shopee",destination_url:"https://shopee.co.id/item?affiliate=owner"}]);expect(parseDestinationLines("")).toEqual([]);});
it.each(["http://127.0.0.1/private","https://user:pass@example.test/","javascript:alert(1)","https://shopee.co.id/a\nhttps://shopee.co.id/b"])("rejects unsafe/duplicate destination text %s",value=>expect(()=>parseDestinationLines(value)).toThrow());
it("denies restricted Owner before creation dispatch",async()=>{
 const f=fixture();f.restrict();expect((await saveProductDestinations(f.client,input)).status).toBe("unavailable");expect(f.calls).not.toContain("save_current_owner_product_destinations");
});
it("actor change after commit stays unknown without retry",async()=>{
 const f=fixture();f.change();expect((await saveProductDestinations(f.client,input)).status).toBe("outcome_unknown");expect(f.calls.filter(x=>x==="save_current_owner_product_destinations")).toHaveLength(1);
});
it("malformed acknowledgment never becomes successful creation",async()=>{
 const f=fixture();f.malform();expect((await saveProductDestinations(f.client,input)).status).toBe("outcome_unknown");
});
it("creation deadline cancels an unresponsive boundary",async()=>{
 vi.useFakeTimers();const f=fixture();let signal:AbortSignal|undefined;
 const client={...f.client as object,auth:{getClaims:async()=>({data:{claims:{sub:subject}},error:null})},schema:()=>({rpc:()=>({abortSignal:(s:AbortSignal)=>{signal=s;return new Promise(()=>{});}})})};
 const result=saveProductDestinations(client as never,input);await vi.advanceTimersByTimeAsync(5001);expect((await result).status).toBe("unavailable");expect(signal?.aborted).toBe(true);
});

it("reader rejects a wrong reference rather than exposing another Item",async()=>{const f=fixture();f.setPayload({...context,reference:99,source_revision:1,preparation_revision:null,destinations:[],has_primary_image:false});expect((await createProductDestinationsReader(f.client,3).read()).status).toBe("unavailable");});
it("guarded destination reader validates two identical observations",async()=>{const f=fixture();const data={...context,reference:3,source_revision:1,preparation_revision:null,destinations:[],has_primary_image:false};f.setPayload(data);expect(await createProductDestinationsReader(f.client,3).read()).toEqual(data);expect(f.calls.filter(x=>x==="resolve_current_owner_product_destinations")).toHaveLength(2);});
