import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityTextInitializationIntentSchema } from "./identity-text-initialization-intent";
import { createOwnerFirstTextInitialization, type OwnerFirstTextInitializationResult } from "./owner-first-text-initialization";
import { createOwnerTextWorkingAssembly, type OwnerTextWorkingAssemblyResult } from "./owner-text-working-assembly";

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

type Snapshot = Extract<OwnerTextWorkingAssemblyResult, { status: "success" }>;
type Readback = { status: "unavailable" } | {
  status: "current"; relation: "same_revision" | "newer_revision"; snapshot: Snapshot;
};
export type OwnerFirstTextInitializationReviewResult = Exclude<OwnerFirstTextInitializationResult, { status: "success" }> | {
  status: "initialized"; block_id: string; collection_revision: 1; readback: Readback;
};

/** Unmounted known-ID observations; acknowledgment and current selected state stay separate. */
export function createOwnerFirstTextInitializationReview(client: Pick<SupabaseClient, "auth" | "schema">) {
  const initializer = createOwnerFirstTextInitialization(client);
  const assembly = createOwnerTextWorkingAssembly(client);
  return {
    async initialize(value: unknown): Promise<OwnerFirstTextInitializationReviewResult> {
      const parsed = identityTextInitializationIntentSchema.safeParse(value);
      if (!parsed.success) return { status: "invalid_initialization_intent" };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let invoked = false;
      const failure = (): OwnerFirstTextInitializationReviewResult => ({ status: invoked ? "outcome_unknown" : "unavailable" });
      const prove = async (): Promise<Proof | null> => {
        const { data, error } = await client.auth.getClaims();
        if (controller.signal.aborted) return null;
        const subject = uuid.safeParse(data?.claims?.sub);
        if (error || !subject.success) return { subject: null, state: {
          status: "unauthenticated", owner_id: null, account_state: null, onboarding_completed: null,
        } };
        const reply = await client.schema("api").rpc("resolve_current_owner_state").abortSignal(controller.signal);
        if (controller.signal.aborted || reply.error !== null) return null;
        const state = statePayload.safeParse(reply.data);
        return !state.success || state.data.status === "unauthenticated" ? null : { subject: subject.data, state: state.data };
      };
      try {
        return await Promise.race([
          (async (): Promise<OwnerFirstTextInitializationReviewResult> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return failure();
            if (before.state.status !== "active") return { status: before.state.status };
            const same = (proof: Proof | null) => !controller.signal.aborted && proof !== null
              && proof.subject === before.subject && proof.state.status === "active"
              && proof.state.owner_id === before.state.owner_id;
            // Its own bounded lifecycle may still commit after outer cancellation.
            invoked = true;
            const ack = await initializer.initialize(parsed.data);
            if (controller.signal.aborted) return failure();
            if (ack.status !== "success") return ack;
            if (!same(await prove())) return failure();
            const snapshot = await assembly.read({ block_id: ack.block_id });
            if (controller.signal.aborted) return failure();
            if (snapshot.status !== "success" && snapshot.status !== "unavailable") return failure();
            if (!same(await prove())) return failure();
            let readback: Readback = { status: "unavailable" };
            if (snapshot.status === "success") {
              const revision = snapshot.collection_revision;
              const row = snapshot.block;
              const matches = row.block_id === ack.block_id && row.kind === "text"
                && row.position === 1 && row.is_visible === parsed.data.is_visible && row.payload_state === "present"
                && row.text_working !== null && row.text_working.text === parsed.data.text_working.text;
              if (revision > ack.collection_revision || (revision === ack.collection_revision && matches)) {
                readback = { status: "current", relation: revision === ack.collection_revision ? "same_revision" : "newer_revision", snapshot };
              }
            }
            return { status: "initialized", block_id: ack.block_id, collection_revision: ack.collection_revision, readback };
          })(),
          new Promise<OwnerFirstTextInitializationReviewResult>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(failure());
          }, 10000); }),
        ]);
      } catch { return failure(); }
      finally { clearTimeout(timer); }
    },
  };
}
