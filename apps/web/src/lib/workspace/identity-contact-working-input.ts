import "server-only";
import { z } from "zod";

const rawText = (maximum: number) => z.string().refine(value =>
  Array.from(value).length <= maximum && !value.includes(String.fromCharCode(0))).nullable();
export const identityContactWorkingInputSchema = z.object({
  kind: z.literal("contact"),
  contact_type: z.enum(["email", "whatsapp", "phone"]).nullable(),
  label: rawText(512),
  value: rawText(2048),
}).strict();
export type IdentityContactWorkingInput = z.infer<typeof identityContactWorkingInputSchema>;
export type IdentityContactWorkingIssue = Readonly<{
  field: "contact_type" | "label" | "value";
  code: "contact_type_required" | "value_required" | "label_control_character" | "value_control_character";
}>;
export type IdentityContactWorkingInputResult = { status: "invalid_working_shape" }
  | { status: "working"; data: IdentityContactWorkingInput; issues: IdentityContactWorkingIssue[] };
const hasControl = (value: string | null) => value !== null && Array.from(value).some(char => {
  const code = char.codePointAt(0)!; return code < 32 || code === 127;
});

/** Raw Working shape/basic diagnostics only; no contact-target validation, action or persistence. */
export function inspectIdentityContactWorkingInput(value: unknown): IdentityContactWorkingInputResult {
  const parsed = identityContactWorkingInputSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_working_shape" };
  const data = parsed.data;
  const issues: IdentityContactWorkingIssue[] = [];
  if (data.contact_type === null) issues.push({ field: "contact_type", code: "contact_type_required" });
  if (!data.value?.trim()) issues.push({ field: "value", code: "value_required" });
  if (hasControl(data.label)) issues.push({ field: "label", code: "label_control_character" });
  if (hasControl(data.value)) issues.push({ field: "value", code: "value_control_character" });
  return { status: "working", data, issues };
}
