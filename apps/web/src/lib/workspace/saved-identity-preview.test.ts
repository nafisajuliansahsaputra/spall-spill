import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerEditableIdentityWorking, type OwnerEditableIdentityWorkingResult } from "./owner-editable-identity-working";
import { createTrustedProfileMediaPreviewUrl } from "@/lib/profile-media/preview";
import { readSavedIdentityPreview } from "./saved-identity-preview";
vi.mock("./owner-editable-identity-working", () => ({ createOwnerEditableIdentityWorking: vi.fn() }));
vi.mock("@/lib/profile-media/preview", () => ({ createTrustedProfileMediaPreviewUrl: vi.fn() }));
const client = {} as Pick<SupabaseClient, "auth" | "schema">;
const key = "27600000-0000-4000-8000-000000000001";
function snapshot(): Extract<OwnerEditableIdentityWorkingResult, {status:"success"}> {
  return { status:"success",current_handle:"preview-owner",primary_use_case:"personal",
    profile_working:{display_name:"Saved",bio:null,profile_asset_key:key,revision:1},
    editable_profile:{display_name:"Saved",bio:null,profile_asset_key:key},profile_text_issues:[],
    layout_working:{starter_key:"clean",revision:1},connection_source_working:null,
    legacy_identity_work:"unchanged",publication_comparison:"not_assessed",profile_text_working:null,profile_text_state:"source",
    revision_vector:{profile:1,layout:1,connection:null,blocks:1,profile_text:null},
    collection:{revision:1,blocks:[]}};
}
function fixture(value = snapshot()) {
  const read = vi.fn().mockResolvedValue(value);
  vi.mocked(createOwnerEditableIdentityWorking).mockReturnValue({read});
  vi.mocked(createTrustedProfileMediaPreviewUrl).mockImplementation(async key => `https://media.example.test/${key}`);
  return {read,value};
}
afterEach(() => vi.useRealTimers());
it("signs only unique trusted selected profile and visible registered media", async () => {
  const f = fixture();
  const row = (id:string, visible:boolean, state:"registered"|"unavailable", asset=key) => ({block_id:id,position:Number(id),kind:"media" as const,is_visible:visible,payload_state:"present" as const,media_asset_state:state,working:{kind:"media" as const,asset_key:asset,alt_text:null},issues:[]});
  f.value.collection!.blocks = [row("1",true,"registered"),row("2",false,"registered","hidden"),row("3",true,"unavailable","unavailable"),row("4",true,"registered","visible")];
  const result = await readSavedIdentityPreview(client);
  expect(result.status).toBe("success");expect(f.read).toHaveBeenCalledTimes(2);
  expect(vi.mocked(createTrustedProfileMediaPreviewUrl).mock.calls).toEqual([[key],["visible"]]);
  expect(createOwnerEditableIdentityWorking).toHaveBeenCalledWith(client);
});
it.each(["unauthenticated","restricted","unavailable"] as const)("initial %s never signs",async status=>{
  const f=fixture();f.read.mockResolvedValue({status});expect(await readSavedIdentityPreview(client)).toEqual({status});
  expect(createTrustedProfileMediaPreviewUrl).not.toHaveBeenCalled();expect(f.read).toHaveBeenCalledTimes(1);
});
it("discards preview if any saved content changes during signing",async()=>{
  const f=fixture();f.read.mockResolvedValueOnce(f.value).mockResolvedValueOnce({...f.value,editable_profile:{...f.value.editable_profile,bio:"Changed"}});
  expect(await readSavedIdentityPreview(client)).toEqual({status:"unavailable"});
});
it("post-signing restriction never returns old private content",async()=>{
  const f=fixture();f.read.mockResolvedValueOnce(f.value).mockResolvedValueOnce({status:"suspended"});
  expect(await readSavedIdentityPreview(client)).toEqual({status:"suspended"});
});
it("optional signing failure preserves selected media as unavailable",async()=>{
  fixture();vi.mocked(createTrustedProfileMediaPreviewUrl).mockResolvedValue(null);
  const result=await readSavedIdentityPreview(client);expect(result.status).toBe("success");
  if(result.status==="success"){expect(result.profile_working.profile_asset_key).toBe(key);expect(result.preview_media[key]).toBeNull();}
});
it("bounds concurrency and deadline without late reads or signing dispatch",async()=>{
  vi.useFakeTimers();const f=fixture();
  f.value.collection!.blocks=Array.from({length:7},(_,i)=>({block_id:String(i),position:i+1,kind:"media",is_visible:true,payload_state:"present",media_asset_state:"registered",working:{kind:"media",asset_key:`asset-${i}`,alt_text:null},issues:[]}));
  const releases:((value:string|null)=>void)[]=[];
  vi.mocked(createTrustedProfileMediaPreviewUrl).mockImplementation(()=>new Promise(resolve=>releases.push(resolve)));
  const pending=readSavedIdentityPreview(client);await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toEqual({status:"unavailable"});expect(releases).toHaveLength(4);
  for(const release of releases)release("https://media.example.test/late");await vi.advanceTimersByTimeAsync(1);
  expect(f.read).toHaveBeenCalledTimes(1);expect(createTrustedProfileMediaPreviewUrl).toHaveBeenCalledTimes(4);
});
