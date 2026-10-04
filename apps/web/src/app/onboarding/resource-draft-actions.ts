"use server";

import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
import { redirect } from "next/navigation";
import { redirectToCurrentOwnerDestination } from "@/lib/auth/action-destination";
import { z } from "zod";
import { ensureExternalDestinationPending } from "@/lib/external-destination/safety";
import { scanAndRecordPendingExternalDestination } from "@/lib/external-destination/trusted-recorder";
import { createClient } from "@/lib/supabase/server";
import {
  resourceDraftSuccessSchema, resourceTitleSchema, resourceTypeSchema,
  type ResourceDraftActionState,
} from "@/lib/onboarding/resource-draft-contract";

export async function saveResourceDraftAction(
  _previous: ResourceDraftActionState, formData: FormData,
): Promise<ResourceDraftActionState> {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const resourceType = read("resourceType");
  const sourceUrl = read("resourceSourceUrl");
  const title = read("resourceTitle");
  const fieldErrors: ResourceDraftActionState["fieldErrors"] = {};
  const failure = (message: string): ResourceDraftActionState => ({
    status: "error", message, resourceType, sourceUrl, title, fieldErrors,
  });
  const parsedType = resourceTypeSchema.safeParse(resourceType);
  if (!parsedType.success) fieldErrors.resourceType = "Choose what this Resource is for.";
  if (!resourceTitleSchema.safeParse(title).success) fieldErrors.title = "Enter a title within 160 characters without control characters.";
  let normalizedUrl: string | null = null;
  if (sourceUrl) {
    try {
      normalizedUrl = normalizeExternalDestination(sourceUrl).normalizedUrl;
      if (normalizedUrl.length > 2048) throw new Error("Source exceeds the Draft limit.");
    } catch {
      fieldErrors.sourceUrl = "Enter a safe external http:// or https:// Resource URL.";
    }
  }
  if (!title && !sourceUrl) fieldErrors.title = "Add a title or Resource URL to save your Draft.";
  if (!parsedType.success || Object.keys(fieldErrors).length) return failure("Check your Resource Draft and try again.");
  const rawRevision = formData.get("baseResourceRevision");
  const revision = rawRevision === "" || rawRevision === null
    ? { success: true as const, data: null }
    : typeof rawRevision === "string"
      ? z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).safeParse(rawRevision)
      : { success: false as const };
  if (!revision.success) return failure("Your saved Resource Draft could not be verified. Reload the page.");
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("save_current_owner_resource_draft", {
    input_resource_type: parsedType.data, input_source_url: normalizedUrl,
    input_title: title || null, base_resource_revision: revision.data,
  });
  if (error) return failure("We couldn't confirm this save. Reload to check your last saved Resource Draft.");
  const status = z.object({ status: z.string() }).safeParse(data);
  if (status.success && ["unauthenticated", "owner_missing", "owner_not_eligible"].includes(status.data.status)) {
    return await redirectToCurrentOwnerDestination();
  }
  if (status.success && status.data.status === "stale_write") {
    return failure("This Resource Draft changed in another tab or session. Reload before saving again.");
  }
  const saved = resourceDraftSuccessSchema.safeParse(data);
  const draft = saved.success ? saved.data.resource_draft : null;
  if (!draft || draft.resource_type !== parsedType.data || draft.source_url !== normalizedUrl
      || draft.title !== (title || null) || draft.revision !== (revision.data ?? 0) + 1) {
    return failure("We couldn't verify this save. Reload to check your Resource Draft.");
  }
  if (draft.source_url) {
    try {
      const pending = await ensureExternalDestinationPending(draft.source_url);
      if (pending.requiresScan) await scanAndRecordPendingExternalDestination(pending);
    } catch {
      // Content is already committed. Missing/failed safety remains fail-closed.
    }
  }
  redirect("/onboarding?step=relevant_first_job");
}
