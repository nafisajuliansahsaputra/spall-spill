import "server-only";
import { publicSpillReferenceSchema } from "@/lib/public/locators";
/** Navigation intent only; the protected editor resolves current own Item truth. */
export function ownerReferenceEditorPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 17) return null;
  const parsed = publicSpillReferenceSchema.safeParse(value.startsWith("#") ? value.slice(1) : value);
  return parsed.success ? `/dashboard/spill/${parsed.data}/edit` : null;
}
