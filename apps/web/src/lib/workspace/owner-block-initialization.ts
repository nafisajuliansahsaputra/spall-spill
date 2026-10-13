import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityConnectionBlockImportIntentSchema } from "./identity-connection-block-import";

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
const intent = identityConnectionBlockImportIntentSchema.extend({ base_collection_revision: z.null() });
const response = z.discriminatedUnion("status", [
  z.object({ status: z.literal("success"), collection_revision: z.literal(1),
    block_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/) }).strict(),
  z.object({ status: z.enum(["unauthenticated", "owner_missing", "owner_not_eligible", "unavailable",
    "invalid_import_intent", "already_initialized", "no_source", "stale_source"]) }).strict(),
]);
export type OwnerBlockInitializationResult = z.infer<typeof response> | {
  status: "outcome_unknown" | "onboarding_incomplete" | "restricted" | "suspended";
};

/** Unmounted mutation transport. Lost responses cannot prove rollback; reconcile authoritative truth before any retry. */
export function createOwnerBlockInitialization(client: Pick<SupabaseClient, "auth" | "schema">) {
  return {
    async initialize(value: unknown): Promise<OwnerBlockInitializationResult> {
      const parsedIntent = intent.safeParse(value);
      if (!parsedIntent.success) return { status: "invalid_import_intent" };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let dispatched = false;
      const failure = (): OwnerBlockInitializationResult => ({ status: dispatched ? "outcome_unknown" : "unavailable" });
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
          (async (): Promise<OwnerBlockInitializationResult> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return failure();
            if (before.state.status !== "active") return { status: before.state.status };
            // From this point a missing acknowledgment may conceal a committed transaction.
            dispatched = true;
            const reply = await client.schema("api").rpc("initialize_current_owner_blocks_from_connection", {
              input_intent: parsedIntent.data,
            }).abortSignal(controller.signal);
            if (controller.signal.aborted || reply.error !== null) return failure();
            const parsedReply = response.safeParse(reply.data);
            if (!parsedReply.success) return failure();
            if (parsedReply.data.status !== "success") return parsedReply.data;
            const after = await prove();
            if (controller.signal.aborted || !after || after.subject !== before.subject
              || after.state.status !== "active" || after.state.owner_id !== before.state.owner_id) return failure();
            return parsedReply.data;
          })(),
          new Promise<OwnerBlockInitializationResult>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(failure());
          }, 5000); }),
        ]);
      } catch { return failure(); }
      finally { clearTimeout(timer); }
    },
  };
}
