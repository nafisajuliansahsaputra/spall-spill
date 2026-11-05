import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),save:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createProfileEditorClient:mocks.client}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/lib/workspace/owner-block-link-working-save",async importOriginal=>({...await importOriginal<object>(),createOwnerBlockLinkWorkingSave:()=>({save:mocks.save})}));
import { saveLinkWorkingAction,type LinkSaveState } from "./link-actions";
const previous:LinkSaveState={status:"idle",message:null,revision:null};
const blockId="26300000-0000-4000-8000-000000000011";
function form(){const value=new FormData();for(const [key,text] of Object.entries({blockId,collectionRevision:"1",kind:"generic_link",title:" Raw <title> ",platform:"",destination:"javascript:unfinished"}))value.set(key,text);return value;}
beforeEach(()=>{vi.clearAllMocks();mocks.client.mockResolvedValue({});mocks.save.mockResolvedValue({status:"success",block_id:blockId,collection_revision:2});});
it("preserves unfinished raw content without public validation or destination fetching",async()=>{
 expect(await saveLinkWorkingAction(previous,form())).toMatchObject({status:"saved",revision:2});
 expect(mocks.save).toHaveBeenCalledExactlyOnceWith({block_id:blockId,base_collection_revision:1,link_working:{kind:"generic_link",title:" Raw <title> ",social_platform:null,destination_url:"javascript:unfinished"}});
 expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/dashboard/identity");
});
it("preserves empty Social platform for recoverable Working",async()=>{
 const data=form();data.set("kind","social");await saveLinkWorkingAction(previous,data);expect(mocks.save.mock.calls[0]![0].link_working.social_platform).toBe("");
});
it.each(["owner_id","subject","published","position","is_visible"])("denies caller authority %s before admission",async key=>{
 const data=form();data.set(key,"forged");expect((await saveLinkWorkingAction(previous,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["blockId","collectionRevision","kind","title","platform","destination"])("denies missing/duplicated %s",async key=>{
 const data=form();data.delete(key);expect((await saveLinkWorkingAction(previous,data)).status).toBe("error");data.append(key,"x");data.append(key,"x");expect((await saveLinkWorkingAction(previous,data)).status).toBe("error");expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["0","01","1.1","9007199254740992","bad"])("denies malformed revision %s",async revision=>{
 const data=form();data.set("collectionRevision",revision);expect((await saveLinkWorkingAction(previous,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["stale_write","block_not_found","outcome_unknown","restricted"])("requires reconciliation after %s",async status=>{
 mocks.save.mockResolvedValue({status});expect((await saveLinkWorkingAction(previous,form())).status).toBe("reload");expect(mocks.save).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("does not expose service failure",async()=>{
 mocks.client.mockRejectedValue(new Error("private provider detail"));const reply=await saveLinkWorkingAction(previous,form());expect(reply.status).toBe("reload");expect(reply.message).not.toContain("private provider detail");expect(mocks.save).not.toHaveBeenCalled();
});
