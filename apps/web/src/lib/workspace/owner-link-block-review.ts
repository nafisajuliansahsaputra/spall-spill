import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityLinkInitializationIntentSchema } from "./identity-link-initialization-intent";
import { createOwnerFirstLinkInitialization, type OwnerFirstLinkInitializationResult } from "./owner-first-link-initialization";
import { identityLinkAdditionIntentSchema } from "./identity-link-addition-intent";
import { createOwnerLinkBlockAllocation, type OwnerLinkBlockAllocationResult } from "./owner-link-block-allocation";
import { createOwnerBlocksWorkingAssembly, type OwnerBlocksWorkingAssemblyResult } from "./owner-blocks-working-assembly";

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

type Snapshot = Extract<OwnerBlocksWorkingAssemblyResult, { status: "success" }>;
type Readback = { status: "unavailable" } | {
  status: "current"; relation: "same_revision" | "newer_revision"; snapshot: Snapshot;
};
export type OwnerLinkBlockAllocationReviewResult = Exclude<OwnerLinkBlockAllocationResult, { status: "success" }> | {
  status: "allocated"; block_id: string; collection_revision: number; readback: Readback;
};

export type OwnerFirstLinkInitializationReviewResult = Exclude<OwnerFirstLinkInitializationResult, { status: "success" }> | {
  status: "initialized"; block_id: string; collection_revision: 1; readback: Readback;
};
type Result = OwnerLinkBlockAllocationReviewResult | OwnerFirstLinkInitializationReviewResult;
type Client = Pick<SupabaseClient, "auth" | "schema">;
type Review<T> = { run(value: unknown): Promise<T> };

/** Closed internal dispatch; neither mode is inferred from an invalid caller intent. */
export function createOwnerLinkBlockReview(client: Client, mode: "addition"): Review<OwnerLinkBlockAllocationReviewResult>;
export function createOwnerLinkBlockReview(client: Client, mode: "initialization"): Review<OwnerFirstLinkInitializationReviewResult>;
export function createOwnerLinkBlockReview(client: Client, mode: "addition" | "initialization"): Review<Result> {
  const mutate = mode === "addition" ? createOwnerLinkBlockAllocation(client).add : createOwnerFirstLinkInitialization(client).initialize;
  const assembly = createOwnerBlocksWorkingAssembly(client);
  return {
    async run(value: unknown): Promise<Result> {
      if (mode !== "addition" && mode !== "initialization") return { status: "unavailable" };
      const parsed = mode === "addition" ? identityLinkAdditionIntentSchema.safeParse(value) : identityLinkInitializationIntentSchema.safeParse(value);
      if (!parsed.success) return { status: mode === "addition" ? "invalid_add_intent" : "invalid_initialization_intent" };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let invoked = false;
      const failure = (): Result => ({ status: invoked ? "outcome_unknown" : "unavailable" });
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
          (async (): Promise<Result> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return failure();
            if (before.state.status !== "active") return { status: before.state.status };
            const same = (proof: Proof | null) => !controller.signal.aborted && proof !== null
              && proof.subject === before.subject && proof.state.status === "active"
              && proof.state.owner_id === before.state.owner_id;
            // Invocation may still commit under its own bounded lifecycle after outer cancellation.
            invoked = true;
            const ack = await mutate(parsed.data);
            if (controller.signal.aborted) return failure();
            if (ack.status !== "success") return ack;
            if (mode === "initialization" && ack.collection_revision !== 1) return failure();
            if (!same(await prove())) return failure();
            const snapshot = await assembly.read();
            if (controller.signal.aborted) return failure();
            if (snapshot.status !== "success" && snapshot.status !== "unavailable") return failure();
            if (!same(await prove())) return failure();
            let readback: Readback = { status: "unavailable" };
            if (snapshot.status === "success" && snapshot.collection !== null) {
              const revision = snapshot.collection.revision;
              const row = snapshot.collection.blocks.find(block => block.block_id === ack.block_id);
              const raw = parsed.data.link_working;
              const matches = row?.kind === raw.kind && row.is_visible === parsed.data.is_visible
                && row.payload_state === "present" && row.link_working !== null
                && row.link_working.title === raw.title && row.link_working.social_platform === raw.social_platform
                && row.link_working.destination_url === raw.destination_url
                && (mode === "addition" || (snapshot.collection.blocks.length === 1 && row.position === 1));
              if (revision > ack.collection_revision || (revision === ack.collection_revision && matches)) {
                readback = { status: "current", relation: revision === ack.collection_revision ? "same_revision" : "newer_revision", snapshot };
              }
            }
            return mode === "addition"
              ? { status: "allocated", block_id: ack.block_id, collection_revision: ack.collection_revision, readback }
              : { status: "initialized", block_id: ack.block_id, collection_revision: 1, readback };
          })(),
          new Promise<Result>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(failure());
          }, 10000); }),
        ]);
      } catch { return failure(); }
      finally { clearTimeout(timer); }
    },
  };
}
