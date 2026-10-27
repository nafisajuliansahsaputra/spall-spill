import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { identityMediaEditorCommandSchema as schema, type IdentityMediaEditorCommand } from "./identity-media-editor-command";
import { identityMediaAdditionIntentSchema } from "./identity-media-addition-intent";
import { identityMediaSaveIntentSchema } from "./identity-media-save-intent";
import { identityMediaInitializationIntentSchema } from "./identity-media-initialization-intent";
import { identityContactEditorCommandSchema } from "./identity-contact-editor-command";
import { identityTextEditorCommandSchema } from "./identity-text-editor-command";
const id="90000000-0000-4000-8000-000000000003", asset="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const raw={kind:"media" as const,asset_key:asset,alt_text:" Raw "};
const commands:IdentityMediaEditorCommand[]=[
 {action:"add_media_block",base_collection_revision:4,is_visible:false,media_working:raw},
 {action:"save_media_block",base_collection_revision:4,block_id:id,media_working:raw},
 {action:"initialize_media_block",base_collection_revision:null,is_visible:true,media_working:raw},
];
afterEach(()=>vi.restoreAllMocks());
for(const command of commands){
 it(`${command.action} parses a copied strict command without I/O or UUID allocation`,()=>{
  const fetcher=vi.spyOn(globalThis,"fetch");const uuid=vi.spyOn(globalThis.crypto,"randomUUID");
  const parsed=schema.parse(command);expect(parsed).toEqual(command);expect(parsed).not.toBe(command);expect(parsed.media_working).not.toBe(command.media_working);
  expect(fetcher).not.toHaveBeenCalled();expect(uuid).not.toHaveBeenCalled();
  expect(identityContactEditorCommandSchema.safeParse(command).success).toBe(false);expect(identityTextEditorCommandSchema.safeParse(command).success).toBe(false);
 });
 for(const asset_key of [null,asset,asset.toUpperCase()]){
  it.each([null,"","  ","\t\r\n","x\u0001","e\u0301🐈","<script>no()</script>","https://127.0.0.1/private","🐈".repeat(2048)])(`${command.action} preserves raw ${asset_key} %#`,alt_text=>{
   const input={...command,media_working:{kind:"media",asset_key,alt_text}};expect(schema.parse(input)).toEqual(input);
  });
 }
 it.each(["owner_id","position","url","rpc","client","commands","issues","asset_state","published","operation_id","source_upload_intent_id"])(`${command.action} rejects authority/result field %s`,key=>expect(schema.safeParse({...command,[key]:null}).success).toBe(false));
 it.each(["kind","asset_key","alt_text"])(`${command.action} requires raw %s`,key=>{
  const working:Record<string,unknown>={...raw};delete working[key];expect(schema.safeParse({...command,media_working:working}).success).toBe(false);
 });
 it.each([null,{},[],{...raw,kind:"contact"},{...raw,asset_key:"not-uuid"},{...raw,asset_key:1},{...raw,alt_text:1},{...raw,alt_text:"NUL\u0000"},{...raw,alt_text:"🐈".repeat(2049)},{...raw,object_key:"private"}])(`${command.action} rejects malformed raw %#`,media_working=>expect(schema.safeParse({...command,media_working}).success).toBe(false));
 it.each([null,undefined,"",true,"SAVE_MEDIA_BLOCK","save_media_block ","publish","add_contact_block"])(`${command.action} never infers action %j`,action=>expect(schema.safeParse({...command,action}).success).toBe(false));
 it(`${command.action} rejects wrong operation selectors and missing fields`,()=>{
  const wrong=command.action==="save_media_block"?{...command,is_visible:false}:{...command,block_id:id};expect(schema.safeParse(wrong).success).toBe(false);
  for(const key of Object.keys(command)){const v:Record<string,unknown>={...command};delete v[key];expect(schema.safeParse(v).success).toBe(false);}
 });
 it(`${command.action} copied caller and parsed payload never alias`,()=>{
  const input=structuredClone(command);const parsed=schema.parse(input);parsed.media_working.alt_text="parsed";expect(input).toEqual(command);
  input.media_working.asset_key=null;expect(command.media_working.asset_key).toBe(asset);
 });
}
it.each([null,undefined,[],{},[commands[0]],{command:commands[0]},"add_media_block"])("no wrapper/batch/coercion for %#",input=>expect(schema.safeParse(input).success).toBe(false));
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,"1",true,null,undefined,Infinity,NaN])("existing command rejects base %j rather than initializing",base_collection_revision=>{
 for(const command of commands.slice(0,2))expect(schema.safeParse({...command,base_collection_revision}).success).toBe(false);
});
it.each([0,1,Number.MAX_SAFE_INTEGER,"null",false,undefined])("initialize requires explicit expected-null %j",base_collection_revision=>expect(schema.safeParse({...commands[2],base_collection_revision}).success).toBe(false));
it.each([null,undefined,"false",0])("add/init require explicit boolean %j",is_visible=>{
 for(const command of [commands[0],commands[2]])expect(schema.safeParse({...command,is_visible}).success).toBe(false);
});
it.each([null,undefined,"forged",id.replace("9000","ABCD"),1])("save requires canonical existing ID %j",block_id=>expect(schema.safeParse({...commands[1],block_id}).success).toBe(false));
it("retains direct save boundary and maximum safe local base without claiming capacity",()=>{
 expect(identityMediaAdditionIntentSchema.safeParse(commands[0]).success).toBe(true);expect(identityMediaInitializationIntentSchema.safeParse(commands[2]).success).toBe(true);
 expect(identityMediaSaveIntentSchema.safeParse(commands[1]).success).toBe(false);
 const {action,...save}=commands[1]!;expect(action).toBe("save_media_block");expect(identityMediaSaveIntentSchema.safeParse(save).success).toBe(true);
 for(const command of commands.slice(0,2))expect(schema.safeParse({...command,base_collection_revision:Number.MAX_SAFE_INTEGER}).success).toBe(true);
 expectTypeOf<Extract<IdentityMediaEditorCommand,{action:"initialize_media_block"}>["base_collection_revision"]>().toEqualTypeOf<null>();
});
