import "server-only";
import { z } from "zod";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";

const rawText = (max: number) => z.string().refine(value =>
  Array.from(value).length <= max && !value.includes(String.fromCharCode(0))).nullable();
export const identityLinkWorkingInputSchema = z.object({ kind: z.enum(["social", "generic_link"]),
  title: rawText(512), social_platform: rawText(40), destination_url: rawText(2048),
}).strict();
export type IdentityLinkWorkingInput = z.infer<typeof identityLinkWorkingInputSchema>;
export type IdentityLinkWorkingIssue = Readonly<{
  field: "title" | "social_platform" | "destination_url";
  code: "title_required" | "title_control_character" | "platform_required" | "platform_invalid"
    | "platform_not_applicable" | "destination_required" | "destination_invalid";
}>;
export type IdentityLinkWorkingInputResult = { status: "invalid_working_shape" }
  | { status: "working"; data: IdentityLinkWorkingInput; issues: IdentityLinkWorkingIssue[] };

/** Local owner-only diagnostics; no persistence, provider proof or publication authority. */
export function inspectIdentityLinkWorkingInput(value: unknown): IdentityLinkWorkingInputResult {
  const parsed = identityLinkWorkingInputSchema.safeParse(value);
  if (!parsed.success) return { status: "invalid_working_shape" };
  const data = parsed.data;
  const issues: IdentityLinkWorkingIssue[] = [];
  if (data.kind === "generic_link" && !data.title?.trim()) issues.push({ field: "title", code: "title_required" });
  if (data.title !== null && Array.from(data.title).some(char => {
    const code = char.codePointAt(0)!; return code < 32 || code === 127;
  })) issues.push({ field: "title", code: "title_control_character" });
  if (data.kind === "social") {
    if (!data.social_platform?.trim()) issues.push({ field: "social_platform", code: "platform_required" });
    else if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(data.social_platform)) issues.push({ field: "social_platform", code: "platform_invalid" });
  } else if (data.social_platform !== null) issues.push({ field: "social_platform", code: "platform_not_applicable" });
  if (!data.destination_url?.trim()) issues.push({ field: "destination_url", code: "destination_required" });
  else {
    try { normalizeExternalDestination(data.destination_url); }
    catch { issues.push({ field: "destination_url", code: "destination_invalid" }); }
  }
  return { status: "working", data, issues };
}
