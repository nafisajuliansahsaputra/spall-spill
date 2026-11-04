import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerGuardedRead, type OwnerReadDenial } from "./owner-guarded-read";
import {
  ownerProfileTextDbCandidateIntentSchema,
  ownerProfileTextDbCandidateResultSchema,
  type OwnerProfileTextDbCandidateResult,
} from "./owner-profile-text-db-candidate";

export type GuardedOwnerProfileTextDbCandidateResult = OwnerProfileTextDbCandidateResult | OwnerReadDenial;

/** Private validation only. Does not publish, extend receipts or activate grants. */
export function createOwnerProfileTextDbCandidate(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async prepare(value: unknown): Promise<GuardedOwnerProfileTextDbCandidateResult> {
      const intent = ownerProfileTextDbCandidateIntentSchema.safeParse(value);
      if (!intent.success) return { status: "invalid_candidate_request" };
      const reader = createOwnerGuardedRead<OwnerProfileTextDbCandidateResult>(client, async signal => {
        if (signal.aborted) return null;
        const reply = await client.schema("api").rpc("prepare_current_owner_identity_profile_text_candidate", {
          input_candidate: intent.data,
        }).abortSignal(signal);
        if (signal.aborted || reply.error !== null
          || Buffer.byteLength(JSON.stringify(reply.data), "utf8") > 8 * 1024 * 1024) return null;
        const parsed = ownerProfileTextDbCandidateResultSchema.safeParse(reply.data);
        if (!parsed.success) return null;
        const result = parsed.data;
        if (result.status === "success" && (result.receipt_id !== intent.data.receipt_id
          || result.snapshot_hash !== intent.data.snapshot_hash || Date.parse(result.expires_at) <= Date.now())) return null;
        return result;
      }, (context, result) => result.status !== "success" || result.assessment === "blocked"
        || result.candidate.current_handle === context.current_handle);
      const result = await reader.read();
      // Final claims/state proof can itself span the receipt deadline.
      if (result.status === "success" && Date.parse(result.expires_at) <= Date.now()) return { status: "unavailable" };
      return result;
    },
  };
}
