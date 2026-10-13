import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerHomeContextReader, type OwnerHomeContext } from "./owner-home-context";
import { createOwnerBlocksWorkingReader, type OwnerBlocksWorking } from "./owner-blocks-working";

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
type Denial = { status: Exclude<State["status"], "active"> | "unavailable" };
export type OwnerBlocksWorkingAssemblyResult = Denial | OwnerBlocksWorking;
const unavailable: Denial = { status: "unavailable" };
const matches = (a: OwnerHomeContext, b: OwnerHomeContext) =>
  a.current_handle === b.current_handle && a.primary_use_case === b.primary_use_case;

/** Unmounted known-persisted parts only; full Identity comparison, routing, scoped activation and live proof remain separate gates. */
export function createOwnerBlocksWorkingAssembly(client: Pick<SupabaseClient, "auth" | "schema">) {
  const contextReader = createOwnerHomeContextReader(client);
  const blocksReader = createOwnerBlocksWorkingReader(client);
  return {
    async read(): Promise<OwnerBlocksWorkingAssemblyResult> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
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
          (async (): Promise<OwnerBlocksWorkingAssemblyResult> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return unavailable;
            if (before.state.status !== "active") return { status: before.state.status };
            const [context, blocks] = await Promise.all([contextReader.read(), blocksReader.read()]);
            if (controller.signal.aborted || !context || !blocks || !matches(context, blocks)) return unavailable;
            const check = (proof: Proof | null): Denial | null => {
              if (!proof || controller.signal.aborted) return unavailable;
              if (proof.subject === null) return { status: "unauthenticated" };
              if (proof.subject !== before.subject
                || (proof.state.owner_id !== null && proof.state.owner_id !== before.state.owner_id)) return unavailable;
              return proof.state.status === "active" ? null : { status: proof.state.status };
            };
            const middleDenial = check(await prove());
            if (middleDenial) return middleDenial;
            const [current, currentBlocks] = await Promise.all([contextReader.read(), blocksReader.read()]);
            if (controller.signal.aborted || !current || !currentBlocks
              || !matches(context, current) || !matches(context, currentBlocks)
              // Full strict parsed snapshot equality also catches data drift without a revision bump.
              || JSON.stringify(blocks.collection) !== JSON.stringify(currentBlocks.collection)) return unavailable;
            const finalDenial = check(await prove());
            if (finalDenial) return finalDenial;
            return blocks;
          })(),
          new Promise<Denial>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(unavailable);
          }, 5000); }),
        ]);
      } catch { return unavailable; }
      finally { clearTimeout(timer); }
    },
  };
}
