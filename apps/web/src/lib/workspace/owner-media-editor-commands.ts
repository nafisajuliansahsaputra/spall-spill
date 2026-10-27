import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityMediaEditorCommandSchema } from "./identity-media-editor-command";
import { createOwnerMediaBlockAllocationReview, type OwnerMediaBlockAllocationReviewResult } from "./owner-media-block-allocation-review";
import { createOwnerBlockMediaWorkingSaveReview, type OwnerBlockMediaWorkingSaveReviewResult } from "./owner-block-media-working-save-review";
import { createOwnerFirstMediaInitializationReview, type OwnerFirstMediaInitializationReviewResult } from "./owner-first-media-initialization-review";

export type OwnerMediaEditorCommandResult = { status: "invalid_media_command" }
  | OwnerMediaBlockAllocationReviewResult | OwnerBlockMediaWorkingSaveReviewResult | OwnerFirstMediaInitializationReviewResult;

/** Unmounted private dispatch. The caller must supply a request-bound session client. */
export function createOwnerMediaEditorCommands(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async execute(value: unknown): Promise<OwnerMediaEditorCommandResult> {
      const parsed = identityMediaEditorCommandSchema.safeParse(value);
      if (!parsed.success) return { status: "invalid_media_command" };
      switch (parsed.data.action) {
        case "add_media_block": return createOwnerMediaBlockAllocationReview(client).add(parsed.data);
        case "initialize_media_block": return createOwnerFirstMediaInitializationReview(client).initialize(parsed.data);
        case "save_media_block": return createOwnerBlockMediaWorkingSaveReview(client).save({
          block_id: parsed.data.block_id,
          base_collection_revision: parsed.data.base_collection_revision,
          media_working: parsed.data.media_working,
        });
      }
    },
  };
}
