import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityTextEditorCommandSchema } from "./identity-text-editor-command";
import { createOwnerTextBlockAllocationReview, type OwnerTextBlockAllocationReviewResult } from "./owner-text-block-allocation-review";
import { createOwnerBlockTextWorkingSaveReview, type OwnerBlockTextWorkingSaveReviewResult } from "./owner-block-text-working-save-review";
import { createOwnerFirstTextInitializationReview, type OwnerFirstTextInitializationReviewResult } from "./owner-first-text-initialization-review";

export type OwnerTextEditorCommandResult = { status: "invalid_text_command" }
  | OwnerTextBlockAllocationReviewResult | OwnerBlockTextWorkingSaveReviewResult | OwnerFirstTextInitializationReviewResult;

/** Unmounted private dispatch. The caller must supply a request-bound session client. */
export function createOwnerTextEditorCommands(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async execute(value: unknown): Promise<OwnerTextEditorCommandResult> {
      const parsed = identityTextEditorCommandSchema.safeParse(value);
      if (!parsed.success) return { status: "invalid_text_command" };
      switch (parsed.data.action) {
        case "add_text_block": return createOwnerTextBlockAllocationReview(client).add(parsed.data);
        case "initialize_text_block": return createOwnerFirstTextInitializationReview(client).initialize(parsed.data);
        case "save_text_block": return createOwnerBlockTextWorkingSaveReview(client).save({
          block_id: parsed.data.block_id,
          base_collection_revision: parsed.data.base_collection_revision,
          text_working: parsed.data.text_working,
        });
      }
    },
  };
}
