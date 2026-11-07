import { beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({save:vi.fn(),client:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createProductDestinationsClient:mocks.client}));
vi.mock("@/lib/workspace/product-destinations",async original=>({...await original<object>(),saveProductDestinations:mocks.save}));
import { saveProductDestinationsAction } from "./destination-actions";
const idle={status:"idle" as const,message:null,revision:null};
function form(){const f=new FormData();f.set("reference","3");f.set("sourceRevision","1");f.set("preparationRevision","");f.set("destinations","https://shopee.co.id/item?affiliate=owner");return f;}
beforeEach(()=>{mocks.client.mockResolvedValue({});mocks.save.mockResolvedValue({status:"success",preparation_revision:1});});
it("saves normalized independent destination intent and acknowledges next base",async()=>{expect((await saveProductDestinationsAction(idle,form())).revision).toBe(1);expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/spill/3/edit");expect(mocks.save.mock.calls[0]![1]).toEqual({reference:3,base_source_revision:1,base_preparation_revision:null,destinations:[{provider_key:"shopee",destination_url:"https://shopee.co.id/item?affiliate=owner"}]});});
it.each(["owner_id","primaryAssetKey","operation"])("rejects %s injection before client work",async key=>{const f=form();f.set(key,"foreign");expect((await saveProductDestinationsAction(idle,f)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it("rejects duplicate form keys",async()=>{const f=form();f.append("reference","9");expect((await saveProductDestinationsAction(idle,f)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it("invalid links stay local without dispatch",async()=>{const f=form();f.set("destinations","javascript:alert(1)");expect((await saveProductDestinationsAction(idle,f)).status).toBe("error");expect(mocks.client).not.toHaveBeenCalled();});
it("empty destinations explicitly remove only destinations",async()=>{const f=form();f.set("destinations","");await saveProductDestinationsAction(idle,f);expect(mocks.save.mock.calls[0]![1].destinations).toEqual([]);});
it("unknown save freezes for readback without retry",async()=>{mocks.save.mockResolvedValue({status:"outcome_unknown"});expect((await saveProductDestinationsAction(idle,form())).status).toBe("reload");expect(mocks.save).toHaveBeenCalledTimes(1);expect(mocks.revalidate).not.toHaveBeenCalled();});
