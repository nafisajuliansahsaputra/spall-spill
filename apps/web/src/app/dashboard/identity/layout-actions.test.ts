import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),save:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createProfileEditorClient:mocks.client}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/lib/workspace/owner-layout-working-save",async importOriginal=>({...await importOriginal<object>(),createOwnerLayoutWorkingSave:()=>({save:mocks.save})}));
import { saveLayoutWorkingAction,type LayoutSaveState } from "./layout-actions";
const previous:LayoutSaveState={status:"idle",message:null,revision:null};
function form(){const value=new FormData();value.set("layoutRevision","2");value.set("starterKey","clean");return value;}
beforeEach(()=>{vi.clearAllMocks();mocks.client.mockResolvedValue({});mocks.save.mockResolvedValue({status:"success",layout_working:{starter_key:"clean",revision:3},changed:true});});
it.each(["clean","social_focus","featured","business"])("passes exact %s intent and acknowledges saved revision",async key=>{
 const value=form();value.set("starterKey",key);mocks.save.mockResolvedValue({status:"success",layout_working:{starter_key:key,revision:3},changed:true});
 expect((await saveLayoutWorkingAction(previous,value))).toMatchObject({status:"saved",revision:3});
 expect(mocks.save).toHaveBeenCalledExactlyOnceWith({action:"save_layout_working",base_layout_revision:2,starter_key:key});
 expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/dashboard/identity");
});
it("acknowledges no-op without incrementing revision",async()=>{
 mocks.save.mockResolvedValue({status:"success",layout_working:{starter_key:"clean",revision:2},changed:false});
 expect(await saveLayoutWorkingAction(previous,form())).toMatchObject({status:"saved",revision:2,message:"This starting style is already saved in Working."});
});
it.each(["0","01","1.5","-1","9007199254740992","2junk"])("denies malformed revision %s before session admission",async value=>{
 const data=form();data.set("layoutRevision",value);expect((await saveLayoutWorkingAction(previous,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["owner_id","handle","subject","published"])("denies caller authority %s",async key=>{
 const data=form();data.set(key,"forged");expect((await saveLayoutWorkingAction(previous,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["starterKey","layoutRevision"])("denies absent/duplicated %s",async key=>{
 const data=form();data.delete(key);expect((await saveLayoutWorkingAction(previous,data)).status).toBe("error");
 data.append(key,"2");data.append(key,"2");expect((await saveLayoutWorkingAction(previous,data)).status).toBe("error");expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["stale_write","outcome_unknown","unavailable","restricted"])("requires explicit reconciliation after %s without invalidation/retry",async status=>{
 mocks.save.mockResolvedValue({status});expect((await saveLayoutWorkingAction(previous,form())).status).toBe("reload");expect(mocks.save).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("does not expose private provider failure",async()=>{
 mocks.client.mockRejectedValue(new Error("private failure"));const result=await saveLayoutWorkingAction(previous,form());expect(result.status).toBe("reload");expect(result.message).not.toContain("private failure");expect(mocks.save).not.toHaveBeenCalled();
});
