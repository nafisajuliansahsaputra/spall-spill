import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn(),save:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createStarterRecoveryClient:mocks.client}));
vi.mock("@/lib/workspace/starter-recovery",async actual=>({...await actual<typeof import("@/lib/workspace/starter-recovery")>(),saveStarterWorking:mocks.save}));
import {saveStarterItemAction} from "./actions";
const initial={status:"idle" as const,message:null,revision:null};
function form(){const data=new FormData();for(const [key,value]of Object.entries({reference:"1",sourceRevision:"2",workingRevision:"",title:"",sourceUrl:"javascript:unfinished()",resourceType:""}))data.set(key,value);return data;}
beforeEach(()=>{vi.clearAllMocks();mocks.client.mockResolvedValue({});mocks.save.mockResolvedValue({status:"success",reference:1,source_revision:2,working_revision:1});});
it("submits raw Working and stable reference,not Published/source changes",async()=>{
 const result=await saveStarterItemAction(initial,form());expect(result.status).toBe("saved");expect(result.revision).toBe(1);expect(mocks.revalidate.mock.calls).toEqual([["/dashboard"],["/dashboard/spill/1/edit"]]);
 expect(mocks.save).toHaveBeenCalledExactlyOnceWith({}, {reference:1,base_source_revision:2,base_working_revision:null,working:{title:"",source_url:"javascript:unfinished()",resource_type:null}});
});
it.each(["owner_id","subject","item_id","publication"])("denies caller authority %s before session/DB",async key=>{
 const data=form();data.set(key,"forged");expect((await saveStarterItemAction(initial,data)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["reference","sourceRevision","workingRevision","title","sourceUrl","resourceType"])("requires explicit field %s",async key=>{
 const data=form();data.delete(key);expect((await saveStarterItemAction(initial,data)).status).toBe("error");expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["0","-1","bad","1.5","9007199254740992"])("rejects malformed CAS %s",async value=>{
 const data=form();data.set("workingRevision",value);expect((await saveStarterItemAction(initial,data)).status).toBe("error");expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["outcome_unknown","unavailable"])("requires reload after %s without retry",async status=>{
 mocks.save.mockResolvedValue({status});expect((await saveStarterItemAction(initial,form())).status).toBe("reload");expect(mocks.save).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("never reveals provider/credential errors",async()=>{
 mocks.client.mockRejectedValue(new Error("private credentials detail"));const result=await saveStarterItemAction(initial,form());expect(result.status).toBe("reload");expect(result.message).not.toContain("private credentials detail");expect(mocks.save).not.toHaveBeenCalled();
});
