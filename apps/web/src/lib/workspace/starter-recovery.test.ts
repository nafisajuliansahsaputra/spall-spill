import { createClient } from "@supabase/supabase-js";
import { afterEach,expect,it,vi } from "vitest";
import { createStarterRecoveryReader,saveStarterWorking,starterSaveSchema } from "./starter-recovery";
const subject="26100000-0000-4000-8000-000000000001",owner="26100000-0000-4000-8000-000000000002";
const active={status:"active",owner_id:owner,account_state:"active",onboarding_completed:true};
const context={status:"success",current_handle:"starter-owner",primary_use_case:"personal"};
const item={reference:1,kind:"product",source_revision:2,working_revision:null,source_changed:false,title:"First",source_url:"https://shop.example.test/a",resource_type:null,published_lifecycle:null,has_primary_image:false,destinations:[]};
const page={...context,items:[item]};
const intent={reference:1,base_source_revision:2,base_working_revision:null,working:{title:"",source_url:"javascript:private()",resource_type:null}};
function fixture(){
 const states:unknown[]=[active,active,active],pages:unknown[]=[page,page],calls:string[]=[];
 let ack:unknown={status:"success",reference:1,source_revision:2,working_revision:1};
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{const name=String(url).split('/').at(-1)!;calls.push(name);
  expect(init?.signal).toBeDefined();expect(new Headers(init?.headers).get("content-profile")).toBe("api");
  return Response.json(name==="resolve_current_owner_state"?states.shift():name==="resolve_current_owner_home_context"?context:name==="resolve_current_owner_starter_recovery"?pages.shift():ack);
 });
 const client=createClient("https://starter.example.test","fixture",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fetcher}});
 const claims=vi.spyOn(client.auth,"getClaims").mockResolvedValue({data:{claims:{sub:subject}},error:null} as never);
 return {client,claims,states,pages,calls,fetcher,setAck:(value:unknown)=>{ack=value;}};
}
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});
it("assembles two exact complete observations under three Owner proofs",async()=>{
 const f=fixture();expect(await createStarterRecoveryReader(f.client).read()).toEqual(page);expect(f.claims).toHaveBeenCalledTimes(3);expect(f.calls).toHaveLength(7);
});
it.each(["restricted","suspended","onboarding_incomplete"])("denies %s before private work",async status=>{
 const f=fixture();f.states[0]={status,owner_id:owner,account_state:status==="onboarding_incomplete"?"active":status,onboarding_completed:status!=="onboarding_incomplete"};
 expect(await createStarterRecoveryReader(f.client).read()).toEqual({status});expect(f.calls).toEqual(["resolve_current_owner_state"]);
});
it("does not synthesize malformed or foreign Owner state",async()=>{
 const f=fixture();f.states[1]={...active,owner_id:"26100000-0000-4000-8000-000000000003"};expect(await createStarterRecoveryReader(f.client).read()).toEqual({status:"unavailable"});
});
it("rejects drift between complete recovery observations",async()=>{
 const f=fixture();f.pages[1]={...page,items:[{...item,title:"another save"}]};expect(await createStarterRecoveryReader(f.client).read()).toEqual({status:"unavailable"});
});
it.each([{...page,owner_id:owner},{...page,items:[item,item]},{...page,items:[{...item,resource_type:"document"}]},{...page,items:[{...item,source_revision:0}]}])("rejects malformed/private recovery envelope %#",async value=>{
 const f=fixture();f.pages[0]=value;expect(await createStarterRecoveryReader(f.client).read()).toEqual({status:"unavailable"});
});
it("sends raw Working once and verifies exact reference/source/revision acknowledgment",async()=>{
 const f=fixture();expect(await saveStarterWorking(f.client,intent)).toEqual({status:"success",reference:1,source_revision:2,working_revision:1});
 expect(f.calls).toEqual(["resolve_current_owner_state","save_current_owner_starter_item_working","resolve_current_owner_state"]);
 expect(JSON.parse(String(f.fetcher.mock.calls[1]![1]!.body))).toEqual({input_working:intent});expect(f.claims).toHaveBeenCalledTimes(2);
});
it.each([{...intent,owner_id:owner},{...intent,reference:0},{...intent,working:{...intent.working,title:"\0"}},{...intent,working:{...intent.working,title:"x".repeat(16385)}}])("rejects invalid or authority-bearing intent before I/O %#",async value=>{
 const f=fixture();expect(starterSaveSchema.safeParse(value).success).toBe(false);expect(await saveStarterWorking(f.client,value)).toEqual({status:"invalid_working"});expect(f.claims).not.toHaveBeenCalled();
});
it.each([{status:"stale_write"},{status:"success",reference:2,source_revision:2,working_revision:1},{status:"success",reference:1,source_revision:3,working_revision:1},{status:"success",reference:1,source_revision:2,working_revision:2}])("never claims committed success on unbound/stale reply %#",async ack=>{
 const f=fixture();f.setAck(ack);expect(await saveStarterWorking(f.client,intent)).toEqual({status:"outcome_unknown"});expect(f.calls.filter(x=>x==="save_current_owner_starter_item_working")).toHaveLength(1);
});
it("rejects a different authenticated subject after mutation",async()=>{
 const f=fixture();f.claims.mockResolvedValueOnce({data:{claims:{sub:subject}},error:null} as never).mockResolvedValueOnce({data:{claims:{sub:owner}},error:null} as never);
 expect(await saveStarterWorking(f.client,intent)).toEqual({status:"outcome_unknown"});
});
it("aborts a dispatched unresolved save at five seconds and never retries",async()=>{
 vi.useFakeTimers();const f=fixture();
 f.fetcher.mockImplementation(async(url)=>String(url).endsWith("save_current_owner_starter_item_working")?new Promise<Response>(()=>{}):Response.json(active));
 const pending=saveStarterWorking(f.client,intent);await vi.advanceTimersByTimeAsync(5000);expect(await pending).toEqual({status:"outcome_unknown"});
 const mutation=f.fetcher.mock.calls.filter(([url])=>String(url).endsWith("save_current_owner_starter_item_working"));expect(mutation).toHaveLength(1);expect(mutation[0]![1]!.signal!.aborted).toBe(true);
});
