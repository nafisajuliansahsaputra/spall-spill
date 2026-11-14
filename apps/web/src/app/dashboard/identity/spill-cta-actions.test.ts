import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({client:vi.fn(),initialize:vi.fn(),add:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createSpillCtaEditorClient:m.client}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("@/lib/workspace/owner-first-spill-cta-initialization",()=>({createOwnerFirstSpillCtaInitialization:()=>({initialize:m.initialize})}));
vi.mock("@/lib/workspace/owner-spill-cta-block-allocation",()=>({createOwnerSpillCtaBlockAllocation:()=>({add:m.add})}));
import { createSpillCtaWorkingAction } from "./spill-cta-actions";
const idle={status:"idle" as const,message:null,revision:null};
function form(base=""){const f=new FormData();f.set("collectionRevision",base);f.set("visibility","false");return f;}
beforeEach(()=>{vi.clearAllMocks();m.client.mockResolvedValue({});for(const fn of [m.initialize,m.add])fn.mockResolvedValue({status:"success",collection_revision:3});});
it("derives the fixed semantic target for explicit first creation",async()=>{expect((await createSpillCtaWorkingAction(idle,form())).status).toBe("saved");expect(m.initialize).toHaveBeenCalledExactlyOnceWith({action:"initialize_spill_cta_block",base_collection_revision:null,is_visible:false,spill_cta_working:{kind:"spill_cta",target:"owner_spill"}});expect(m.add).not.toHaveBeenCalled();expect(m.revalidate).toHaveBeenCalledExactlyOnceWith("/dashboard/identity");});
it("appends with exact shared base without falling back to init",async()=>{await createSpillCtaWorkingAction(idle,form("2"));expect(m.add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({action:"add_spill_cta_block",base_collection_revision:2}));expect(m.initialize).not.toHaveBeenCalled();});
it.each(["owner_id","subject","handle","url","label","target","blockId"])("rejects caller %s before I/O",async key=>{const f=form();f.set(key,"forged");expect((await createSpillCtaWorkingAction(idle,f)).status).toBe("error");expect(m.client).not.toHaveBeenCalled();});
it.each(["0","01","-1","1.5","9007199254740992","1e2"])("rejects malformed base %s",async base=>{expect((await createSpillCtaWorkingAction(idle,form(base))).status).toBe("error");expect(m.client).not.toHaveBeenCalled();});
it.each(["visibility","collectionRevision"])("rejects missing/duplicate/file %s",async key=>{const f=form();f.delete(key);expect((await createSpillCtaWorkingAction(idle,f)).status).toBe("error");f.append(key,"x");f.append(key,"x");expect((await createSpillCtaWorkingAction(idle,f)).status).toBe("error");f.delete(key);f.set(key,new Blob(["x"]));expect((await createSpillCtaWorkingAction(idle,f)).status).toBe("error");expect(m.client).not.toHaveBeenCalled();});
it.each(["","1","yes"])("requires explicit visibility %s",async value=>{const f=form();f.set("visibility",value);expect((await createSpillCtaWorkingAction(idle,f)).status).toBe("error");expect(m.client).not.toHaveBeenCalled();});
it.each(["already_initialized","stale_write","outcome_unknown","unavailable"])("freezes after %s without replay/revalidation",async status=>{m.initialize.mockResolvedValue({status});expect((await createSpillCtaWorkingAction(idle,form())).status).toBe("reload");expect(m.initialize).toHaveBeenCalledTimes(1);expect(m.add).not.toHaveBeenCalled();expect(m.revalidate).not.toHaveBeenCalled();});
it("hides private provider errors",async()=>{m.client.mockRejectedValue(Error("private provider"));const r=await createSpillCtaWorkingAction(idle,form());expect(r.status).toBe("reload");expect(r.message).not.toContain("provider");});
