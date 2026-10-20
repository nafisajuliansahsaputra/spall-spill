import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { identityTextEditorCommandSchema as schema, type IdentityTextEditorCommand } from "./identity-text-editor-command";
import { identityTextAdditionIntentSchema } from "./identity-text-addition-intent";
import { identityTextSaveIntentSchema } from "./identity-text-save-intent";
import { identityTextInitializationIntentSchema } from "./identity-text-initialization-intent";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";

const id = "90000000-0000-4000-8000-000000000003";
const commands: IdentityTextEditorCommand[] = [
  { action: "add_text_block", base_collection_revision: 5, is_visible: false, text_working: { kind: "text", text: "original" } },
  { action: "save_text_block", block_id: id, base_collection_revision: 5, text_working: { kind: "text", text: "original" } },
  { action: "initialize_text_block", base_collection_revision: null, is_visible: true, text_working: { kind: "text", text: "original" } },
];
afterEach(() => vi.restoreAllMocks());
it.each(commands)("accepts only explicit $action input without I/O or UUID allocation", command => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("unexpected I/O"));
  const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
  const parsed = schema.safeParse(command); expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("Missing command");
  expect(parsed.data).toEqual(command); expect(parsed.data).not.toBe(command);
  expect(parsed.data.text_working).not.toBe(command.text_working);
  expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  expect(identityLinkEditorCommandSchema.safeParse(command).success).toBe(false);
});
const rawValues = [null, "", "  ", "\t\r\n", "raw\u0001control", "<script>no()</script>",
  "javascript:private", "https://127.0.0.1/private", "**literal**", "e\u0301🐈", "🐈".repeat(16384)];
it.each(commands.flatMap(command => rawValues.map(text => ({ ...command, text_working: { kind: "text", text } }))))(
  "retains recoverable raw Text for command %# without publication validation", command => {
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
      expect(schema.safeParse({ ...command, text_working: { ...command.text_working, [field]: "forged" } }).success).toBe(false);
    });
  it.each([undefined, null, [], {}, { kind: "text" }, { text: null }, { kind: "social", text: null },
    { kind: "text", text: undefined }, { kind: "text", text: 1 }, { kind: "text", text: false },
    { kind: "text", text: "private\u0000" }, { kind: "text", text: "🐈".repeat(16385) },
  ])(`${command.action} rejects malformed or over-budget payload %#`, text_working => {
    expect(schema.safeParse({ ...command, text_working }).success).toBe(false);
  });
  it.each([undefined, null, true, "", "save", "initialize_link_block", "import_onboarding_connection", "publish"])(
    `${command.action} never infers action from base, ID or payload %#`, action => {
      expect(schema.safeParse({ ...command, action }).success).toBe(false);
    });
}
it.each([null, undefined, {}, [], commands, "initialize_text_block"])("rejects non-command %# without default or batch support", value => {
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
  input.text_working.text = "caller changed"; first.text_working.text = "result changed";
  expect(schema.parse(command)).toEqual(original); expect(command).toEqual(original);
});
it("preserves unchanged direct intent boundaries; facade save action must be removed before future dispatch", () => {
  expect(identityTextAdditionIntentSchema.safeParse(commands[0]).success).toBe(true);
  expect(identityTextInitializationIntentSchema.safeParse(commands[2]).success).toBe(true);
  const { action, ...saveIntent } = schema.parse(commands[1]);
  expect(action).toBe("save_text_block"); expect(identityTextSaveIntentSchema.safeParse(commands[1]).success).toBe(false);
  expect(identityTextSaveIntentSchema.safeParse(saveIntent).success).toBe(true);
  expect(schema.safeParse(saveIntent).success).toBe(false);
  const link = { action: "initialize_link_block", base_collection_revision: null, is_visible: false,
    link_working: { kind: "social", title: null, social_platform: null, destination_url: null } };
  expect(identityLinkEditorCommandSchema.safeParse(link).success).toBe(true); expect(schema.safeParse(link).success).toBe(false);
});
it("retains action-discriminated types without introducing another persistence contract", () => {
  type Save = Extract<IdentityTextEditorCommand, { action: "save_text_block" }>;
  type Init = Extract<IdentityTextEditorCommand, { action: "initialize_text_block" }>;
  expectTypeOf<Save["block_id"]>().toEqualTypeOf<string>();
  expectTypeOf<Save["base_collection_revision"]>().toEqualTypeOf<number>();
  expectTypeOf<Init["base_collection_revision"]>().toEqualTypeOf<null>();
  expectTypeOf<Save["text_working"]["text"]>().toEqualTypeOf<string | null>();
});
