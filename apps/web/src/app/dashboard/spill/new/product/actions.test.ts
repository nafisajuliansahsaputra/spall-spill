import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({create:vi.fn(),client:vi.fn(),revalidate:vi.fn(),redirect:vi.fn((path:string)=>{throw Error(`redirect:${path}`);})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createProductCreationClient:mocks.client}));
vi.mock("@/lib/workspace/product-creation",async importOriginal=>({...await importOriginal<object>(),createProductDraft:mocks.create}));
import { createProductDraftAction } from "./actions";
function form(){const f=new FormData();f.set("creationId","26800000-0000-4000-8000-000000000010");f.set("title"," My menu ");f.set("sourceUrl","");return f;}
const initial={status:"idle" as const,message:null};
beforeEach(()=>{mocks.client.mockResolvedValue({});mocks.create.mockResolvedValue({status:"success",reference:3});});
it("redirects only after exact SDK acknowledgment and concrete manager revalidation",async()=>{
 await expect(createProductDraftAction(initial,form())).rejects.toThrow("redirect:/dashboard/spill/3/edit");expect(mocks.create.mock.calls[0]![1]).toEqual({creation_id:"26800000-0000-4000-8000-000000000010",title:"My menu",source_url:null});expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/spill");
});
it.each(["owner_id","reference","operation"])("rejects injected %s before client creation",async key=>{
 const f=form();f.set(key,"foreign");expect((await createProductDraftAction(initial,f)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();
});
it("duplicate form keys are denied",async()=>{const f=form();f.append("title","other");expect((await createProductDraftAction(initial,f)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it("empty shell is not persisted",async()=>{const f=form();f.set("title","");expect((await createProductDraftAction(initial,f)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it("uncertain commit freezes for manager readback without automatic retry",async()=>{
 mocks.create.mockResolvedValue({status:"outcome_unknown"});expect((await createProductDraftAction(initial,form())).status).toBe("reload");expect(mocks.create).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled();expect(mocks.redirect).not.toHaveBeenCalled();
});
