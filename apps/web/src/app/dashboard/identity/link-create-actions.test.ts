import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),initialize:vi.fn(),add:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createProfileEditorClient:mocks.client}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/lib/workspace/owner-first-link-initialization",()=>({createOwnerFirstLinkInitialization:()=>({initialize:mocks.initialize})}));
vi.mock("@/lib/workspace/owner-link-block-allocation",()=>({createOwnerLinkBlockAllocation:()=>({add:mocks.add})}));
import { createLinkWorkingAction } from "./link-create-actions";
const previous={status:"idle" as const,message:null,revision:null};
function form(base=""){const value=new FormData();for(const [key,text] of Object.entries({collectionRevision:base,kind:"generic_link",visibility:"false",title:" Raw title ",platform:"",destination:"unfinished"}))value.set(key,text);return value;}
beforeEach(()=>{vi.clearAllMocks();mocks.client.mockResolvedValue({});mocks.initialize.mockResolvedValue({status:"success",block_id:"26400000-0000-4000-8000-000000000011",collection_revision:1});mocks.add.mockResolvedValue({status:"success",block_id:"26400000-0000-4000-8000-000000000012",collection_revision:3});});
it("explicit absence initializes exactly once without source/default import",async()=>{
 expect(await createLinkWorkingAction(previous,form())).toMatchObject({status:"saved",revision:1});expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith({action:"initialize_link_block",base_collection_revision:null,is_visible:false,link_working:{kind:"generic_link",title:" Raw title ",social_platform:null,destination_url:"unfinished"}});expect(mocks.add).not.toHaveBeenCalled();expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/dashboard/identity");
});
it("existing positive base appends Social with explicit visibility",async()=>{
 const data=form("2");data.set("kind","social");data.set("visibility","true");expect(await createLinkWorkingAction(previous,data)).toMatchObject({status:"saved",revision:3});expect(mocks.initialize).not.toHaveBeenCalled();expect(mocks.add).toHaveBeenCalledExactlyOnceWith({action:"add_link_block",base_collection_revision:2,is_visible:true,link_working:{kind:"social",title:" Raw title ",social_platform:"",destination_url:"unfinished"}});
});
it.each(["owner_id","block_id","source","position","published"])("denies supplied %s before admission",async key=>{const data=form();data.set(key,"forged");expect((await createLinkWorkingAction(previous,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it.each(["collectionRevision","kind","visibility","title","platform","destination"])("denies absent/duplicate %s",async key=>{const data=form();data.delete(key);expect((await createLinkWorkingAction(previous,data)).status).toBe("error");data.append(key,"x");data.append(key,"x");expect((await createLinkWorkingAction(previous,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it.each(["0","01","null","-1","1.5","9007199254740992"])("denies malformed base %s",async value=>{expect((await createLinkWorkingAction(previous,form(value))).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it.each(["", "yes", "1"])("requires explicit boolean visibility %s",async value=>{const data=form();data.set("visibility",value);expect((await createLinkWorkingAction(previous,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it.each(["already_initialized","outcome_unknown","unavailable"])("never retries or falls back after initializer %s",async status=>{mocks.initialize.mockResolvedValue({status});expect((await createLinkWorkingAction(previous,form())).status).toBe("reload");expect(mocks.initialize).toHaveBeenCalledTimes(1);expect(mocks.add).not.toHaveBeenCalled();expect(mocks.revalidate).not.toHaveBeenCalled();});
it("requires reconciliation after stale append without recreation",async()=>{mocks.add.mockResolvedValue({status:"stale_write"});expect((await createLinkWorkingAction(previous,form("2"))).status).toBe("reload");expect(mocks.add).toHaveBeenCalledTimes(1);expect(mocks.initialize).not.toHaveBeenCalled();});
it("hides private service failure",async()=>{mocks.client.mockRejectedValue(new Error("private detail"));const reply=await createLinkWorkingAction(previous,form());expect(reply.status).toBe("reload");expect(reply.message).not.toContain("private detail");});
