import "server-only";
import { z } from "zod";

const home = z.object({
  status: z.literal("success"),
  current_handle: z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),
  primary_use_case: z.enum(["creator", "affiliate", "business", "personal", "other"]),
  product_drafts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resource_drafts: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  identity_work: z.enum(["never_published", "unchanged", "unpublished_changes"]),
}).strict();
const result = z.union([home, z.object({ status: z.enum([
  "unauthenticated", "owner_missing", "onboarding_incomplete", "restricted", "suspended", "unavailable",
]) }).strict()]);
export type OwnerHomeDisposition =
  | { kind: "unavailable" }
  | { kind: "redirect"; href: "/login" | "/onboarding" | "/dashboard/account-status" }
  | { kind: "home"; data: z.infer<typeof home>; actions: readonly never[] };

/** Only consumes trusted guarded assembly output; validation does not authorize a caller. */
export function resolveOwnerHomeDisposition(value: unknown): OwnerHomeDisposition {
  const parsed = result.safeParse(value);
  if (!parsed.success) return { kind: "unavailable" };
  switch (parsed.data.status) {
    case "unauthenticated": return { kind: "redirect", href: "/login" };
    case "onboarding_incomplete": return { kind: "redirect", href: "/onboarding" };
    case "restricted":
    case "suspended": return { kind: "redirect", href: "/dashboard/account-status" };
    case "owner_missing":
    case "unavailable": return { kind: "unavailable" };
    case "success": return { kind: "home", data: parsed.data, actions: Object.freeze([]) };
  }
}
