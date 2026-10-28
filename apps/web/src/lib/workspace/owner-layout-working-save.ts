import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownerLayoutWorkingSchema } from "./owner-composition-working";
export const ownerLayoutWorkingSaveIntentSchema = z.object({
  action: z.literal("save_layout_working"),
  base_layout_revision: ownerLayoutWorkingSchema.shape.revision,
  starter_key: ownerLayoutWorkingSchema.shape.starter_key,
}).strict();
const intent = ownerLayoutWorkingSaveIntentSchema;
export type OwnerLayoutWorkingSaveIntent = z.infer<typeof intent>;

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
const response = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), layout_working: ownerLayoutWorkingSchema, changed: z.boolean() }).strict(),
  z.object({ status: z.enum(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable",
    "invalid_layout_working", "stale_write", "revision_exhausted"]) }).strict(),
]);
export type OwnerLayoutWorkingSaveResult = z.infer<typeof response> | {
  status: "outcome_unknown" | "onboarding_incomplete" | "restricted" | "suspended";
};

/** Unmounted mutation transport. Lost responses cannot prove rollback; reconcile authoritative truth before any retry. */
export function createOwnerLayoutWorkingSave(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async save(value: unknown): Promise<OwnerLayoutWorkingSaveResult> {
      const parsedIntent = intent.safeParse(value);
      if (!parsedIntent.success) return { status: "invalid_layout_working" };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let dispatched = false;
      const failure = (): OwnerLayoutWorkingSaveResult => ({ status: dispatched ? "outcome_unknown" : "unavailable" });
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
          (async (): Promise<OwnerLayoutWorkingSaveResult> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return failure();
            if (before.state.status !== "active") return { status: before.state.status };
            // From this point a missing acknowledgment may conceal a committed transaction.
            dispatched = true;
            const reply = await client.schema("api").rpc("save_current_owner_layout_working", {
              input_working: parsedIntent.data,
            }).abortSignal(controller.signal);
            if (controller.signal.aborted || reply.error !== null) return failure();
            const parsedReply = response.safeParse(reply.data);
            if (!parsedReply.success) return failure();
            if (parsedReply.data.status !== "success") return parsedReply.data;
            if (parsedReply.data.layout_working.starter_key !== parsedIntent.data.starter_key
              || parsedReply.data.layout_working.revision !== parsedIntent.data.base_layout_revision + (parsedReply.data.changed ? 1 : 0)) return failure();
            const after = await prove();
            if (controller.signal.aborted || !after || after.subject !== before.subject
              || after.state.status !== "active" || after.state.owner_id !== before.state.owner_id) return failure();
            return parsedReply.data;
          })(),
          new Promise<OwnerLayoutWorkingSaveResult>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(failure());
          }, 5000); }),
        ]);
      } catch { return failure(); }
      finally { clearTimeout(timer); }
    },
  };
}
