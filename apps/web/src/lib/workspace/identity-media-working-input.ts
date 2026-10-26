import "server-only";
import { z } from "zod";

export const identityMediaWorkingInputSchema = z.object({
  kind: z.literal("media"),
  asset_key: z.string().uuid().nullable(),
  alt_text: z.string().refine(value =>
    Array.from(value).length <= 2048 && !value.includes(String.fromCharCode(0))).nullable(),
}).strict();
export type IdentityMediaWorkingInput = z.infer<typeof identityMediaWorkingInputSchema>;
export type IdentityMediaWorkingIssue = Readonly<{
  field: "asset_key" | "alt_text";
  code: "asset_required" | "alt_text_control_character";
}>;
export type IdentityMediaWorkingInputResult = { status: "invalid_working_shape" }
  | { status: "working"; data: IdentityMediaWorkingInput; issues: IdentityMediaWorkingIssue[] };

/** Local shape/diagnostics only; no asset authority, accessibility policy or persistence. */
export function inspectIdentityMediaWorkingInput(value: unknown): IdentityMediaWorkingInputResult {
  const parsed = identityMediaWorkingInputSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_working_shape" };
  const data = parsed.data;
  const issues: IdentityMediaWorkingIssue[] = [];
  if (data.asset_key === null) issues.push({ field: "asset_key", code: "asset_required" });
  if (data.alt_text !== null && Array.from(data.alt_text).some(char => {
    const code = char.codePointAt(0)!; return code < 32 || code === 127;
  })) issues.push({ field: "alt_text", code: "alt_text_control_character" });
  return { status: "working", data, issues };
}
