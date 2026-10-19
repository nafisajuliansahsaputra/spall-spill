import "server-only";
import { z } from "zod";

export const identityTextWorkingInputSchema = z.object({
  kind: z.literal("text"),
  text: z.string().refine(value =>
    Array.from(value).length <= 16384 && !value.includes(String.fromCharCode(0))).nullable(),
}).strict();
export type IdentityTextWorkingInput = z.infer<typeof identityTextWorkingInputSchema>;
export type IdentityTextWorkingIssue = Readonly<{
  field: "text";
  code: "text_required" | "text_control_character";
}>;
export type IdentityTextWorkingInputResult = { status: "invalid_working_shape" }
  | { status: "working"; data: IdentityTextWorkingInput; issues: IdentityTextWorkingIssue[] };

/** Private local diagnostics only; raw text is neither rendered nor persisted here. */
export function inspectIdentityTextWorkingInput(value: unknown): IdentityTextWorkingInputResult {
  const parsed = identityTextWorkingInputSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_working_shape" };
  const data = parsed.data;
  const issues: IdentityTextWorkingIssue[] = [];
  if (!data.text?.trim()) issues.push({ field: "text", code: "text_required" });
  if (data.text !== null && Array.from(data.text).some(char => {
    const code = char.codePointAt(0)!;
    return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127;
  })) issues.push({ field: "text", code: "text_control_character" });
  return { status: "working", data, issues };
}
