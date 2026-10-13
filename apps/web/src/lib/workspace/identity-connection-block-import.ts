import "server-only";
import { z } from "zod";
import { ownerConnectionWorkingSchema } from "./owner-composition-working";
import { inspectIdentityLinkWorkingInput, type IdentityLinkWorkingInput, type IdentityLinkWorkingIssue } from "./identity-link-working-input";

const intentSchema = z.object({
  action: z.literal("import_onboarding_connection"),
  source_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  title: z.custom<string | null>(title => inspectIdentityLinkWorkingInput({
    kind: "generic_link", title, social_platform: null, destination_url: null,
  }).status === "working"),
}).strict();
export type IdentityConnectionBlockImportResult = {
  status: "invalid_import_intent" | "unavailable_source" | "no_source" | "stale_source";
} | {
  status: "import_candidate";
  source_connection_revision: number;
  link_working: IdentityLinkWorkingInput;
  issues: IdentityLinkWorkingIssue[];
};

/** Pure proposal only. Source must later be Owner-derived and rechecked in the initialization transaction. */
export function prepareIdentityConnectionBlockImport(source: unknown, intent: unknown): IdentityConnectionBlockImportResult {
  const parsedIntent = intentSchema.safeParse(intent);
  if (!parsedIntent.success) return { status: "invalid_import_intent" };
  const parsedSource = ownerConnectionWorkingSchema.nullable().safeParse(source);
  if (!parsedSource.success) return { status: "unavailable_source" };
  if (parsedSource.data === null) return { status: "no_source" };
  const current = parsedSource.data;
  if (current.revision !== parsedIntent.data.source_revision) return { status: "stale_source" };
  const inspected = inspectIdentityLinkWorkingInput({
    kind: current.connection_kind, title: parsedIntent.data.title,
    social_platform: current.social_platform, destination_url: current.destination_url,
  });
  if (inspected.status !== "working") return { status: "unavailable_source" };
  return { status: "import_candidate", source_connection_revision: current.revision,
    link_working: inspected.data, issues: inspected.issues };
}
