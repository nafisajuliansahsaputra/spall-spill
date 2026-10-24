import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityContactEditorCommandSchema } from "./identity-contact-editor-command";
import { createOwnerContactBlockAllocationReview, type OwnerContactBlockAllocationReviewResult } from "./owner-contact-block-allocation-review";
import { createOwnerBlockContactWorkingSaveReview, type OwnerBlockContactWorkingSaveReviewResult } from "./owner-block-contact-working-save-review";
import { createOwnerFirstContactInitializationReview, type OwnerFirstContactInitializationReviewResult } from "./owner-first-contact-initialization-review";

export type OwnerContactEditorCommandResult = { status: "invalid_contact_command" }
  | OwnerContactBlockAllocationReviewResult | OwnerBlockContactWorkingSaveReviewResult | OwnerFirstContactInitializationReviewResult;

/** Unmounted private dispatch. The caller must supply a request-bound session client. */
export function createOwnerContactEditorCommands(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async execute(value: unknown): Promise<OwnerContactEditorCommandResult> {
      const parsed = identityContactEditorCommandSchema.safeParse(value);
      if (!parsed.success) return { status: "invalid_contact_command" };
      switch (parsed.data.action) {
        case "add_contact_block": return createOwnerContactBlockAllocationReview(client).add(parsed.data);
        case "initialize_contact_block": return createOwnerFirstContactInitializationReview(client).initialize(parsed.data);
        case "save_contact_block": return createOwnerBlockContactWorkingSaveReview(client).save({
          block_id: parsed.data.block_id,
          base_collection_revision: parsed.data.base_collection_revision,
          contact_working: parsed.data.contact_working,
        });
      }
    },
  };
}
