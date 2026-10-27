import { afterEach, expect, it, vi } from "vitest";
import { inspectIdentityMediaInitializationIntent as inspect } from "./identity-media-initialization-intent";
import { identityContactAdditionIntentSchema } from "./identity-contact-addition-intent";
import { identityTextAdditionIntentSchema } from "./identity-text-addition-intent";
import { identityMediaSaveIntentSchema } from "./identity-media-save-intent";
const asset = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const working = { kind: "media", asset_key: asset, alt_text: "Raw Media" };
const intent = { action: "initialize_media_block", base_collection_revision: null, is_visible: false, media_working: working };
afterEach(()=>vi.unstubAllGlobals());
for(const asset_key of [asset,asset.toUpperCase(),null]) {
  it.each([null,"","  ","e\u0301🙂","<script>private()</script>","🙂".repeat(2048)])(`keeps raw key ${asset_key} and alt %# without persistence authority`,alt_text=>{
    const data={...intent,media_working:{kind:"media",asset_key,alt_text}};
    expect(inspect(data)).toEqual({status:"intent",data,issues:asset_key===null?[{field:"asset_key",code:"asset_required"}]:[]});
  });
}
it.each(Array.from({length:32},(_,i)=>i+1).filter(x=>x!==32).concat(127))("keeps control %i recoverable",code=>{
  const data={...intent,media_working:{...working,alt_text:`A${String.fromCharCode(code)}B`}};
  expect(inspect(data)).toEqual({status:"intent",data,issues:[{field:"alt_text",code:"alt_text_control_character"}]});
});
it.each([true,false])("requires explicit visibility %s and expected absence",is_visible=>{
 const data={...intent,is_visible};expect(inspect(data)).toEqual({status:"intent",data,issues:[]});
});
it.each([null,undefined,{},[],true,"add",...Object.keys(intent).map(k=>{const v:Record<string,unknown>={...intent};delete v[k];return v;}),
 ...[0,1,-1,1.5,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,"null",true].map(base_collection_revision=>({...intent,base_collection_revision})),
 ...[null,0,"false",undefined].map(is_visible=>({...intent,is_visible})),
 ...["add_contact_block","add_media_block","save_media_block"].map(action=>({...intent,action})),
 ...["block_id","owner_id","asset_state","position","url","issues","source_upload_intent_id"].map(k=>({...intent,[k]:null})),
 ...[null,{},[],{...working,asset_key:"not-uuid"},{...working,alt_text:"🙂".repeat(2049)},{...working,alt_text:"NUL\u0000"},
 ...Object.keys(working).map(k=>{const v:Record<string,unknown>={...working};delete v[k];return v;}),
 ...["owner_id","url","object_key","asset_state","issues"].map(k=>({...working,[k]:null}))].map(media_working=>({...intent,media_working})),
])("rejects malformed intent %# without partial recovery",value=>expect(inspect(value)).toEqual({status:"invalid_initialization_intent"}));
it("copies input and diagnostics without network or ID generation",()=>{
 const fetcher=vi.fn();const uuid=vi.fn();vi.stubGlobal("fetch",fetcher);vi.stubGlobal("crypto",{randomUUID:uuid});
 const data={...intent,media_working:{...working}};const result=inspect(data);
 if(result.status!=="intent")throw new Error("Expected intent");
 data.media_working.alt_text="changed";expect(result.data.media_working.alt_text).toBe("Raw Media");
 result.data.media_working.asset_key=null;expect(data.media_working.asset_key).toBe(asset);
 expect(fetcher).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
});
it("does not convert Contact/Text/save commands",()=>{
 expect(identityContactAdditionIntentSchema.safeParse(intent).success).toBe(false);
 expect(identityTextAdditionIntentSchema.safeParse(intent).success).toBe(false);
 expect(identityMediaSaveIntentSchema.safeParse(intent).success).toBe(false);
});
