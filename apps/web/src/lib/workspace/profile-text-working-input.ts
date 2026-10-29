import "server-only";
import { z } from "zod";
import { identityTextWorkingInputSchema } from "./identity-text-working-input";
const text = identityTextWorkingInputSchema.shape.text.refine(value => value === null || value.isWellFormed());
export const profileTextWorkingInputSchema = z.object({ display_name: text, bio: text }).strict();
export type ProfileTextWorkingInput = z.infer<typeof profileTextWorkingInputSchema>;
export type ProfileTextWorkingIssue = Readonly<{ field: "display_name" | "bio";
  code: "display_name_required" | "display_name_too_long" | "display_name_control_character" | "bio_too_long" | "bio_control_character" }>;
const boundary = /^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g;
/** Local hints only. Raw values stay exact; authoritative Publish validation is separate. */
export function inspectProfileTextWorkingInput(value: ProfileTextWorkingInput): ProfileTextWorkingIssue[] {
  const issues: ProfileTextWorkingIssue[] = [];
  const name = (value.display_name ?? "").replace(boundary, "");
  const bio = (value.bio ?? "").replace(/\r\n?/g, "\n").replace(boundary, "");
  if (!name) issues.push({ field: "display_name", code: "display_name_required" });
  if (Array.from(name).length > 80) issues.push({ field: "display_name", code: "display_name_too_long" });
  if (/[\x00-\x1f\x7f]/.test(name)) issues.push({ field: "display_name", code: "display_name_control_character" });
  if (Array.from(bio).length > 300) issues.push({ field: "bio", code: "bio_too_long" });
  if (/[\x00-\x09\x0b-\x1f\x7f]/.test(bio)) issues.push({ field: "bio", code: "bio_control_character" });
  return issues;
}
