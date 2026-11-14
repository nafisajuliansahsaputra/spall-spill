import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({client:vi.fn(),publish:vi.fn(),available:vi.fn()}));
vi.mock("@/lib/workspace/profile-editor-server",()=>({createOnboardingPublishClient:m.client}));
vi.mock("@/lib/onboarding/first-publish-config",()=>({firstIdentityPublishAvailable:m.available}));
vi.mock("@/lib/onboarding/first-identity-publish",async load=>({...await load<typeof import("@/lib/onboarding/first-identity-publish")>(),createFirstIdentityPublisher:()=>({publish:m.publish})}));
import { firstIdentityPublishAction } from "./first-publish-action";
const idle={status:"idle" as const,message:null,handle:null};
const receipt="27800000-0000-4000-8000-000000000003";
function form(){const f=new FormData();for(const [k,v] of Object.entries({receiptId:receipt,snapshotHash:"a".repeat(64),bundle:"identity_only",confirmIdentityOnly:"true"}))f.set(k,v);return f;}
beforeEach(()=>{vi.clearAllMocks();m.available.mockReturnValue(true);m.client.mockResolvedValue({});m.publish.mockResolvedValue({status:"success",identity_status:"published",item_status:null,bundle:"identity_only",publication_id:receipt,published_at:"2026-11-14T00:00:00Z",current_handle:"published-owner",spill_reference:null});});
it("requires explicit reviewed Identity-only consent and returns verified handoff",async()=>{const r=await firstIdentityPublishAction(idle,form());expect(r.status).toBe("published");expect(r.handle).toBe("published-owner");expect(m.publish).toHaveBeenCalledExactlyOnceWith({input_receipt_id:receipt,input_snapshot_hash:"a".repeat(64)});});
it.each(["receiptId","snapshotHash","bundle","confirmIdentityOnly"])("rejects missing/duplicate/file %s before I/O",async key=>{for(const variant of ["missing","duplicate","file"]){const f=form();if(variant==="missing")f.delete(key);if(variant==="duplicate")f.append(key,"forged");if(variant==="file")f.set(key,new Blob(["x"]));expect((await firstIdentityPublishAction(idle,f)).status).toBe("error");}expect(m.client).not.toHaveBeenCalled();});
it.each(["owner_id","subject","destination_url","returnTo"])("rejects caller selector %s",async key=>{const f=form();f.set(key,"forged");expect((await firstIdentityPublishAction(idle,f)).status).toBe("error");expect(m.client).not.toHaveBeenCalled();});
it.each(["resource","product",""])("cannot substitute bundle %s",async value=>{const f=form();f.set("bundle",value);expect((await firstIdentityPublishAction(idle,f)).status).toBe("error");expect(m.client).not.toHaveBeenCalled();});
it("does not dispatch when staged feature is off",async()=>{m.available.mockReturnValue(false);expect((await firstIdentityPublishAction(idle,form())).status).toBe("reload");expect(m.client).not.toHaveBeenCalled();});
it.each(["outcome_unknown","expired_preview","stale_preview","identity_invalid","identity_preparation_pending","restricted"])("requires explicit reconciliation after %s without retry",async status=>{m.publish.mockResolvedValue({status});expect((await firstIdentityPublishAction(idle,form())).status).toBe("reload");expect(m.publish).toHaveBeenCalledTimes(1);});
it("does not expose provider exceptions",async()=>{m.publish.mockRejectedValue(Error("secret provider"));const r=await firstIdentityPublishAction(idle,form());expect(r.status).toBe("reload");expect(r.message).not.toContain("secret");});
