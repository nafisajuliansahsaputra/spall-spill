import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicHandleSchema } from "../public/locators";
import { isPublicIdentityPath } from "../public/identity-path";
import { previewSnapshotHashSchema } from "./preview-receipt-contract";

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const statePayload = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unauthenticated"), owner_id: z.null(), account_state: z.null(), onboarding_completed: z.null() }).strict(),
  z.object({ status: z.literal("owner_missing"), owner_id: z.null(), account_state: z.null(), onboarding_completed: z.null() }).strict(),
  z.object({ status: z.literal("active"), owner_id: uuid, account_state: z.literal("active"), onboarding_completed: z.literal(true) }).strict(),
  z.object({ status: z.literal("onboarding_incomplete"), owner_id: uuid, account_state: z.literal("active"), onboarding_completed: z.literal(false) }).strict(),
  z.object({ status: z.literal("restricted"), owner_id: uuid, account_state: z.literal("restricted"), onboarding_completed: z.boolean() }).strict(),
  z.object({ status: z.literal("suspended"), owner_id: uuid, account_state: z.literal("suspended"), onboarding_completed: z.boolean() }).strict(),
]);
type State = z.infer<typeof statePayload>;
type Proof = { subject: string | null; state: State };

export const firstPublishIntentSchema = z.object({
  input_receipt_id: uuid, input_snapshot_hash: previewSnapshotHashSchema,
}).strict();
export const firstIdentityPublicationSchema = z.object({
  status: z.literal("success"), identity_status: z.literal("published"), item_status: z.null(),
  bundle: z.literal("identity_only"), publication_id: uuid, published_at: z.iso.datetime({ offset: true }),
  current_handle: publicHandleSchema.refine(handle => isPublicIdentityPath(`/${handle}`)), spill_reference: z.null(),
}).strict();
const response = z.union([firstIdentityPublicationSchema,
  z.object({ status: z.enum(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable",
    "review_required", "expired_preview", "stale_preview", "conflicting_intent", "identity_invalid",
    "identity_preparation_pending", "progress_missing", "revision_exhausted"]) }).strict()]);
export type FirstIdentityPublishResult = z.infer<typeof response> | { status: "outcome_unknown" | "restricted" | "suspended" | "invalid_intent" };

/** One receipt-bound attempt. A missing acknowledgment cannot prove rollback. */
export function createFirstIdentityPublisher(client: Pick<SupabaseClient, "auth" | "schema">) {
  return { async publish(value: unknown): Promise<FirstIdentityPublishResult> {
    const input = firstPublishIntentSchema.safeParse(value);
    if (!input.success) return { status: "invalid_intent" };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dispatched = false;
    const failure = (): FirstIdentityPublishResult => ({ status: dispatched ? "outcome_unknown" : "unavailable" });
    const prove = async (): Promise<Proof | null> => {
      const claims = await client.auth.getClaims();
      if (controller.signal.aborted) return null;
      const subject = uuid.safeParse(claims.data?.claims?.sub);
      if (claims.error || !subject.success) return { subject: null, state: {
        status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null,
      } };
      const reply = await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);
      if (controller.signal.aborted || reply.error !== null) return null;
      const parsed = statePayload.safeParse(reply.data);
      if (!parsed.success || parsed.data.status === "unauthenticated") return null;
      return { subject: subject.data, state: parsed.data };
    };
    try {
      return await Promise.race([
        (async (): Promise<FirstIdentityPublishResult> => {
          const before = await prove();
          if (!before || controller.signal.aborted) return failure();
          if (before.state.status !== "active" && before.state.status !== "onboarding_incomplete") return { status: before.state.status };
          dispatched = true;
          const reply = await client.schema("api").rpc("publish_current_onboarding_identity", input.data).abortSignal(controller.signal);
          if (controller.signal.aborted || reply.error !== null) return failure();
          const parsed = response.safeParse(reply.data);
          if (!parsed.success) return failure();
          if (parsed.data.status !== "success") return parsed.data;
          const after = await prove();
          if (controller.signal.aborted || !after || after.subject !== before.subject
            || after.state.status !== "active" || after.state.owner_id !== before.state.owner_id) return failure();
          return parsed.data;
        })(),
        new Promise<FirstIdentityPublishResult>(resolve => { timer = setTimeout(() => {
          controller.abort(); resolve(failure());
        }, 5000); }),
      ]);
    } catch { return failure(); }
    finally { clearTimeout(timer); }
  } };
}
