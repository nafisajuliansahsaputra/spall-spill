import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerHomeContextReader, type OwnerHomeContext } from "./owner-home-context";
import { createOwnerProfileWorkingReader, type OwnerProfileWorking } from "./owner-profile-working";
import { createOwnerCompositionWorkingReader, type OwnerCompositionWorking } from "./owner-composition-working";

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
export type OwnerIdentityWorkingAssemblyResult = Denial | (OwnerProfileWorking & Pick<OwnerCompositionWorking, "layout_working" | "connection_working" | "identity_work">);
const unavailable: Denial = { status: "unavailable" };
const matches = (a: OwnerHomeContext, b: OwnerHomeContext) =>
  a.current_handle === b.current_handle && a.primary_use_case === b.primary_use_case;

/** Unmounted known-persisted parts only; full Identity, routing, scoped activation and live proof remain separate gates. */
export function createOwnerIdentityWorkingAssembly(client: Pick<SupabaseClient, "auth" | "schema">) {
  const contextReader = createOwnerHomeContextReader(client);
  const profileReader = createOwnerProfileWorkingReader(client);
  const compositionReader = createOwnerCompositionWorkingReader(client);
  return {
    async read(): Promise<OwnerIdentityWorkingAssemblyResult> {
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
          (async (): Promise<OwnerIdentityWorkingAssemblyResult> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return unavailable;
            if (before.state.status !== "active") return { status: before.state.status };
            const [context, profile, composition] = await Promise.all([
              contextReader.read(), profileReader.read(), compositionReader.read(),
            ]);
            if (controller.signal.aborted || !context || !profile || !composition
              || !matches(context, profile) || !matches(context, composition)
              || profile.profile_working.revision !== composition.profile_revision) return unavailable;
            const after = await prove();
            if (!after || controller.signal.aborted) return unavailable;
            if (after.subject === null) return { status: "unauthenticated" };
            if (after.subject !== before.subject
              || (after.state.owner_id !== null && after.state.owner_id !== before.state.owner_id)) return unavailable;
            if (after.state.status !== "active") return { status: after.state.status };
            const current = await contextReader.read();
            if (controller.signal.aborted || !current || !matches(context, current)) return unavailable;
            return { ...context, profile_working: profile.profile_working,
              layout_working: composition.layout_working, connection_working: composition.connection_working,
              identity_work: composition.identity_work };
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
