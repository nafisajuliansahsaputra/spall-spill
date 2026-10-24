import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityContactAdditionIntentSchema as intent } from "./identity-contact-addition-intent";

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
const blockId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const response = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), collection_revision: z.number().int().min(2).max(Number.MAX_SAFE_INTEGER),
    block_id: blockId }).strict(),
  z.object({ status: z.enum(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable",
    "invalid_add_intent", "stale_write", "revision_exhausted", "position_exhausted"]) }).strict(),
]);
export type OwnerContactBlockAllocationResult = z.infer<typeof response> | {
  status: "outcome_unknown" | "onboarding_incomplete" | "restricted" | "suspended";
};

/** Unmounted explicit allocation; acknowledgment is reported by the verified backend.
 * Lost responses cannot prove rollback; reconcile authoritative truth before any new action.
 */
export function createOwnerContactBlockAllocation(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async add(value: unknown): Promise<OwnerContactBlockAllocationResult> {
      const parsedIntent = intent.safeParse(value);
      if (!parsedIntent.success) return { status: "invalid_add_intent" };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let dispatched = false;
      const failure = (): OwnerContactBlockAllocationResult => ({ status: dispatched ? "outcome_unknown" : "unavailable" });
      const prove = async (): Promise<Proof | null> => {
        const { data, error } = await client.auth.getClaims();
        if (controller.signal.aborted) return null;
        const subject = uuid.safeParse(data?.claims?.sub);
        if (error || !subject.success) return { subject: null, state: {
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
          (async (): Promise<OwnerContactBlockAllocationResult> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return failure();
            if (before.state.status !== "active") return { status: before.state.status };
            // From this point a missing acknowledgment may conceal a committed transaction.
            dispatched = true;
            const reply = await client.schema("api").rpc("add_current_owner_contact_block_working", {
              input_intent: parsedIntent.data,
            }).abortSignal(controller.signal);
            if (controller.signal.aborted || reply.error !== null) return failure();
            const parsedReply = response.safeParse(reply.data);
            if (!parsedReply.success) return failure();
            if (parsedReply.data.status !== "success") return parsedReply.data;
            if (parsedReply.data.collection_revision !== parsedIntent.data.base_collection_revision + 1) return failure();
            const after = await prove();
            if (controller.signal.aborted || !after || after.subject !== before.subject
              || after.state.status !== "active" || after.state.owner_id !== before.state.owner_id) return failure();
            return parsedReply.data;
          })(),
          new Promise<OwnerContactBlockAllocationResult>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(failure());
          }, 5000); }),
        ]);
      } catch { return failure(); }
      finally { clearTimeout(timer); }
    },
  };
}
