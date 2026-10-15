import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityLinkEditorCommandSchema } from "./identity-link-editor-command";
import { createOwnerLinkBlockAllocationReview, type OwnerLinkBlockAllocationReviewResult } from "./owner-link-block-allocation-review";
import { createOwnerFirstLinkInitializationReview, type OwnerFirstLinkInitializationReviewResult } from "./owner-first-link-initialization-review";

export type OwnerLinkEditorCommandResult = { status: "invalid_link_command" }
  | OwnerLinkBlockAllocationReviewResult | OwnerFirstLinkInitializationReviewResult;

/** Unmounted private dispatch. The caller must supply a request-bound session client. */
export function createOwnerLinkEditorCommands(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async execute(value: unknown): Promise<OwnerLinkEditorCommandResult> {
      const parsed = identityLinkEditorCommandSchema.safeParse(value);
      if (!parsed.success) return { status: "invalid_link_command" };
      return parsed.data.action === "add_link_block"
        ? createOwnerLinkBlockAllocationReview(client).add(parsed.data)
        : createOwnerFirstLinkInitializationReview(client).initialize(parsed.data);
    },
  };
}
