import { createClient } from "@supabase/supabase-js";
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({service:vi.fn()}));vi.mock("@/lib/supabase/service",()=>({createSupabaseServiceClient:m.service}));
import { readPublicSpill,readPublicSpillDetail } from "./spill-server";
const page={status:"success",current_handle:"creator",display_name:"Creator",q:"needle",kind:"all",has_products:false,has_resources:true,items:[{reference:27,kind:"resource",title:"Needle",resource_type:"document",primary_image_path:null,available:false,rank:2,published_at:"2026-11-14T00:00:00.000000Z"}],has_more:false,next_cursor:null};
let reply:unknown;let quota:boolean;
beforeEach(()=>{reply=page;quota=true;for(const k of ["SPALL_PUBLIC_SPILL_ENABLED","SPALL_PUBLIC_IDENTITY_ENABLED","SPALL_PUBLIC_MEDIA_ENABLED"])vi.stubEnv(k,"true");for(const k of ["SPALL_PUBLIC_SPILL_BUDGET_NAMESPACE","SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE","SPALL_PUBLIC_MEDIA_BUDGET_NAMESPACE"])vi.stubEnv(k,"test");vi.stubEnv("SPALL_PUBLIC_ORIGIN","https://spall.test");vi.stubEnv("UPSTASH_REDIS_REST_URL","https://fixture.upstash.io");vi.stubEnv("UPSTASH_REDIS_REST_TOKEN","fixture-budget-token");vi.stubGlobal("fetch",vi.fn(async(url:unknown)=>String(url).includes("upstash.io")?Response.json({result:quota?1:0}):Response.json(reply)));m.service.mockImplementation((fetcher:typeof fetch)=>createClient("https://fixture.supabase.co","fixture-service-key",{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false}}));});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.useRealTimers();});
it("uses budget then fixed actual abortable RPC with strict query binding",async()=>{expect(await readPublicSpill("CREATOR","needle","all")).toEqual(page);const calls=vi.mocked(fetch).mock.calls;expect(calls).toHaveLength(2);expect(JSON.stringify(calls[0]![1]!.body)).toContain("public-spill-read-test");expect(String(calls[1]![0])).toContain("/rpc/execute_public_spill_server");expect(JSON.parse(String(calls[1]![1]!.body))).toEqual({input_operation:"browse",input_handle:"creator",input_query:{q:"needle",kind:"all",cursor:null}});expect(calls[1]![1]!.cache).toBe("no-store");expect(calls[1]![1]!.redirect).toBe("error");expect(calls[1]![1]!.signal).toBeInstanceOf(AbortSignal);});
it("denies quota before service work",async()=>{quota=false;expect(await readPublicSpill("creator","needle","all")).toBeNull();expect(m.service).not.toHaveBeenCalled();});
it.each(["SPALL_PUBLIC_SPILL_ENABLED","SPALL_PUBLIC_IDENTITY_ENABLED","SPALL_PUBLIC_MEDIA_ENABLED"])("requires staged flag %s",async key=>{vi.stubEnv(key,"false");expect(await readPublicSpill("creator","needle","all")).toBeNull();expect(fetch).not.toHaveBeenCalled();});
it.each(["","UPPER","../other"])("denies bad namespace %s",async value=>{vi.stubEnv("SPALL_PUBLIC_SPILL_BUDGET_NAMESPACE",value);expect(await readPublicSpill("creator","needle","all")).toBeNull();expect(m.service).not.toHaveBeenCalled();});
it.each([{...page,q:"other"},{...page,q:" needle "},{...page,items:[{...page.items[0],source_url:"private"}]},{status:"unavailable",owner_id:"private"},null])("rejects drift/private response %j",async value=>{reply=value;expect(await readPublicSpill("creator","needle","all")).toBeNull();});
it("keeps uniform not-found separate from runtime failure",async()=>{reply={status:"unavailable"};expect(await readPublicSpill("creator","needle","all")).toEqual(reply);});
it("rejects mismatched detail reference",async()=>{reply={status:"success",item_type:"resource",detail:{status:"success",current_handle:"creator",display_name:"Creator",spill_reference:28,title:"Resource",resource_type:"document",available:false}};expect(await readPublicSpillDetail("creator",27)).toBeNull();});
it("aborts a stalled service read without replay",async()=>{vi.useFakeTimers();let signal:AbortSignal|undefined;vi.stubGlobal("fetch",vi.fn(async(url:unknown,init?:RequestInit)=>{if(String(url).includes("upstash.io"))return Response.json({result:1});signal=init?.signal as AbortSignal;return new Promise<Response>(()=>{});}));const pending=readPublicSpill("creator","needle","all");await vi.advanceTimersByTimeAsync(5001);expect(await pending).toBeNull();expect(signal?.aborted).toBe(true);expect(fetch).toHaveBeenCalledTimes(2);});

it.each([5100,100,Number.NaN,Number.POSITIVE_INFINITY])("rejects late/backward/nonfinite service completion before timer callbacks: %s",async completed=>{
 let now=100;const clock=vi.spyOn(performance,"now").mockImplementation(()=>now);
 vi.stubGlobal("fetch",vi.fn(async(url:unknown)=>{if(String(url).includes("upstash.io")){now=101;return Response.json({result:1});}now=completed;return Response.json(page);}));
 try{expect(await readPublicSpill("creator","needle","all")).toBeNull();expect(fetch).toHaveBeenCalledTimes(2);}finally{clock.mockRestore();}
});
it("bounds stalled admission before elevated service dispatch",async()=>{
 vi.useFakeTimers();vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(()=>{})));
 const pending=readPublicSpill("creator","needle","all");await vi.advanceTimersByTimeAsync(5001);
 expect(await pending).toBeNull();expect(m.service).not.toHaveBeenCalled();
});
