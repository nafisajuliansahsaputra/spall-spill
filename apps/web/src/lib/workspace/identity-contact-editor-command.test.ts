import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { identityContactEditorCommandSchema as schema, type IdentityContactEditorCommand } from "./identity-contact-editor-command";
import { identityContactAdditionIntentSchema } from "./identity-contact-addition-intent";
import { identityContactSaveIntentSchema } from "./identity-contact-save-intent";
import { identityContactInitializationIntentSchema } from "./identity-contact-initialization-intent";
import { identityTextEditorCommandSchema } from "./identity-text-editor-command";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";

const id = "90000000-0000-4000-8000-000000000003";
const commands: IdentityContactEditorCommand[] = [
  { action: "add_contact_block", base_collection_revision: 5, is_visible: false, contact_working: { kind: "contact", contact_type: "email", label: " Original Label ", value: "original" } },
  { action: "save_contact_block", block_id: id, base_collection_revision: 5, contact_working: { kind: "contact", contact_type: "email", label: " Original Label ", value: "original" } },
  { action: "initialize_contact_block", base_collection_revision: null, is_visible: true, contact_working: { kind: "contact", contact_type: "email", label: " Original Label ", value: "original" } },
];
afterEach(() => vi.restoreAllMocks());
it.each(commands)("accepts only explicit $action input without I/O or UUID allocation", command => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected I/O"));
  const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
  const parsed = schema.safeParse(command); expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("Missing command");
  expect(parsed.data).toEqual(command); expect(parsed.data).not.toBe(command);
  expect(parsed.data.contact_working).not.toBe(command.contact_working);
  expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  expect(identityLinkEditorCommandSchema.safeParse(command).success).toBe(false);
  expect(identityTextEditorCommandSchema.safeParse(command).success).toBe(false);
});
const rawValues = [null, "", "  ", "\t\r\n", "raw\u0001control", "<script>no()</script>",
  "javascript:private", "https://127.0.0.1/private", "**literal**", "e\u0301🐈", "🐈".repeat(2048)];
it.each(commands.flatMap(command => [null,"email","whatsapp","phone"].flatMap(contact_type => rawValues.map(value => ({ ...command, contact_working: { kind: "contact", contact_type, label: " Raw\r\nLabel ", value } })))))(
  "retains recoverable raw Contact for command %# without publication validation", command => {
    const original = structuredClone(command); const parsed = schema.safeParse(command);
    expect(parsed.success).toBe(true); if (!parsed.success) throw new Error("Missing raw command");
    expect(parsed.data).toEqual(original); expect(command).toEqual(original);
  });
for (const command of commands) {
  it.each(["owner_id", "client", "rpc", "source", "provenance", "receipt", "published", "next_revision", "commands", "version", "input", "operation_id"])(
    `${command.action} rejects outer ${"%s"} authority or wrapper`, field => {
      expect(schema.safeParse({ ...command, [field]: "forged" }).success).toBe(false);
    });
  it.each(["owner_id", "block_id", "position", "html", "format", "issues", "safe", "destination_url"])(
    `${command.action} rejects nested ${"%s"}`, field => {
      expect(schema.safeParse({ ...command, contact_working: { ...command.contact_working, [field]: "forged" } }).success).toBe(false);
    });
  it.each([undefined, null, [], {}, { kind: "contact" }, { value: null },
    ...["kind","contact_type","label","value"].map(field=>{const payload:Record<string,unknown>={...command.contact_working};delete payload[field];return payload;}),
    { ...command.contact_working, kind: "text" }, { ...command.contact_working, contact_type: "Email" },
    ...["contact_type","label","value"].flatMap(field=>[1,false,[],{}].map(value=>({...command.contact_working,[field]:value}))),
    ...["label","value"].map(field=>({...command.contact_working,[field]:"private\u0000"})),
    { ...command.contact_working, label: "🐈".repeat(513) },
    { ...command.contact_working, value: "🐈".repeat(2049) },
  ])(`${command.action} rejects malformed or over-budget payload %#`, contact_working => {
    expect(schema.safeParse({ ...command, contact_working }).success).toBe(false);
  });
  it.each([undefined, null, true, "", "save", "initialize_link_block", "import_onboarding_connection", "publish"])(
    `${command.action} never infers action from base, ID or payload %#`, action => {
      expect(schema.safeParse({ ...command, action }).success).toBe(false);
    });
}
it.each([null, undefined, {}, [], commands, "initialize_contact_block"])("rejects non-command %# without default or batch support", value => {
  expect(schema.safeParse(value).success).toBe(false);
});
it.each([0, -1, 1.5, "5", false, undefined, null, Number.MAX_SAFE_INTEGER + 1])("positive-base commands reject %j instead of initializing", base_collection_revision => {
  for (const command of commands.slice(0, 2)) expect(schema.safeParse({ ...command, base_collection_revision }).success).toBe(false);
});
it.each([0, 1, Number.MAX_SAFE_INTEGER, "null", false, undefined])("initialization requires explicit expected-null, rejects %j", base_collection_revision => {
  expect(schema.safeParse({ ...commands[2], base_collection_revision }).success).toBe(false);
});
it("maximum safe revision stays accepted local input rather than proving write capacity", () => {
  for (const command of commands.slice(0, 2)) expect(schema.safeParse({ ...command, base_collection_revision: Number.MAX_SAFE_INTEGER }).success).toBe(true);
});
it.each([undefined, null, "false", 0])("addition/initialization require explicit boolean visibility %j", is_visible => {
  for (const command of [commands[0], commands[2]]) expect(schema.safeParse({ ...command, is_visible }).success).toBe(false);
});
it.each([undefined, null, "forged", id.toUpperCase().replace("9000", "ABCD"), 1])("existing save needs canonical target %j", block_id => {
  expect(schema.safeParse({ ...commands[1], block_id }).success).toBe(false);
});
it("does not widen action-specific ownership or membership selectors", () => {
  for (const command of [commands[0], commands[2]]) expect(schema.safeParse({ ...command, block_id: id }).success).toBe(false);
  for (const is_visible of [true, false, undefined]) expect(schema.safeParse({ ...commands[1], is_visible }).success).toBe(false);
  for (const command of commands) expect(schema.safeParse({ ...command, position: 1 }).success).toBe(false);
});
it.each(commands)("parsed $action copies stay independent across caller mutation and repeated inspections", command => {
  const input = structuredClone(command); const first = schema.parse(input); const original = structuredClone(command);
  input.contact_working.value = "caller changed"; first.contact_working.value = "result changed";
  expect(schema.parse(command)).toEqual(original); expect(command).toEqual(original);
});
it("preserves unchanged direct intent boundaries; facade save action must be removed before future dispatch", () => {
  expect(identityContactAdditionIntentSchema.safeParse(commands[0]).success).toBe(true);
  expect(identityContactInitializationIntentSchema.safeParse(commands[2]).success).toBe(true);
  const { action, ...saveIntent } = schema.parse(commands[1]);
  expect(action).toBe("save_contact_block"); expect(identityContactSaveIntentSchema.safeParse(commands[1]).success).toBe(false);
  expect(identityContactSaveIntentSchema.safeParse(saveIntent).success).toBe(true);
  expect(schema.safeParse(saveIntent).success).toBe(false);
  const link = { action: "initialize_link_block", base_collection_revision: null, is_visible: false,
    link_working: { kind: "social", title: null, social_platform: null, destination_url: null } };
  expect(identityLinkEditorCommandSchema.safeParse(link).success).toBe(true); expect(schema.safeParse(link).success).toBe(false);
});
it("retains action-discriminated types without introducing another persistence contract", () => {
  type Save = Extract<IdentityContactEditorCommand, { action: "save_contact_block" }>;
  type Init = Extract<IdentityContactEditorCommand, { action: "initialize_contact_block" }>;
  expectTypeOf<Save["block_id"]>().toEqualTypeOf<string>();
  expectTypeOf<Save["base_collection_revision"]>().toEqualTypeOf<number>();
  expectTypeOf<Init["base_collection_revision"]>().toEqualTypeOf<null>();
  expectTypeOf<Save["contact_working"]["value"]>().toEqualTypeOf<string | null>();
});
it.each(commands)("preserves full-bound label and all-null Contact for $action",command=>{
  const allNull={...command,contact_working:{kind:"contact",contact_type:null,label:null,value:null}};
  expect(schema.parse(allNull)).toEqual(allNull);
  const bounded={...command,contact_working:{kind:"contact",contact_type:"phone",label:"🐈".repeat(512),value:"🐈".repeat(2048)}};
  expect(schema.parse(bounded)).toEqual(bounded);
});
it.each(["href","country","provider","action","normalized_value"])("rejects invented nested target field %s",field=>{
  for(const command of commands)expect(schema.safeParse({...command,contact_working:{...command.contact_working,[field]:"forged"}}).success).toBe(false);
});
it("rejects actual Text commands without converting their structured payload",()=>{
  const text={action:"initialize_text_block",base_collection_revision:null,is_visible:true,text_working:{kind:"text",text:null}};
  expect(identityTextEditorCommandSchema.safeParse(text).success).toBe(true);
  expect(schema.safeParse(text).success).toBe(false);
});
