import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOwnerHomeContextReader, type OwnerHomeContext } from "./owner-home-context";
import type { IdentityBlockPageRequest } from "./identity-block-page-request";

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
type RowBase = { block_id: string; position: number };
type Page<R> = OwnerHomeContext & { collection: null | { revision: number; blocks: R[]; has_more: boolean; next_after_position: number | null } };
type PageResult<R> = Page<R> | { status: "unavailable" | "invalid_page_request" | "stale_read" };
type Snapshot<R> = OwnerHomeContext & { collection: null | { revision: number; blocks: R[] } };
export type OwnerWorkingPageAssemblyResult<R> = Denial | Snapshot<R>;
const unavailable: Denial = { status: "unavailable" };
const matches = (a: OwnerHomeContext, b: OwnerHomeContext) =>
  a.current_handle === b.current_handle && a.primary_use_case === b.primary_use_case;

/** Two bounded complete observations; no atomic/global freshness, write, route or publication authority. */
export function createOwnerWorkingPageAssembly<R extends RowBase>(client: Pick<SupabaseClient, "auth" | "schema">,
  pageReader: { read(value: unknown): Promise<PageResult<R>> }, maximumRowBytes?: number) {
  const contextReader = createOwnerHomeContextReader(client);
  return {
    async read(): Promise<OwnerWorkingPageAssemblyResult<R>> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const traverse = async (): Promise<Snapshot<R> | null> => {
        let request: IdentityBlockPageRequest = { expected_collection_revision: null, after_position: null };
        let first: Page<R> | null = null;
        const rows: R[] = [];
        const ids = new Set<string>();
        let rowBytes = 2;
        for (let index = 0; index < 10; index++) {
          if (controller.signal.aborted) return null;
          const page = await pageReader.read(request);
          if (controller.signal.aborted || page.status !== "success") return null;
          if (first === null) first = page;
          if (!matches(first, page)) return null;
          if (page.collection === null) {
            return index === 0 ? { status: "success", current_handle: page.current_handle,
              primary_use_case: page.primary_use_case, collection: null } : null;
          }
          if (first.collection === null || page.collection.revision !== first.collection.revision) return null;
          for (const row of page.collection.blocks) {
            if (ids.has(row.block_id) || (rows.length > 0 && rows.at(-1)!.position >= row.position)) return null;
            if (maximumRowBytes !== undefined) {
              rowBytes += Buffer.byteLength(JSON.stringify(row), "utf8") + (rows.length ? 1 : 0);
              if (rowBytes > maximumRowBytes) return null;
            }
            ids.add(row.block_id); rows.push(row);
          }
          if (!page.collection.has_more) return { status: "success", current_handle: first.current_handle,
            primary_use_case: first.primary_use_case, collection: { revision: first.collection.revision, blocks: rows } };
          request = { expected_collection_revision: first.collection.revision, after_position: page.collection.next_after_position };
        }
        return null;
      };
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
          (async (): Promise<OwnerWorkingPageAssemblyResult<R>> => {
            const before = await prove();
            if (!before || controller.signal.aborted) return unavailable;
            if (before.state.status !== "active") return { status: before.state.status };
            const [context, blocks] = await Promise.all([contextReader.read(), traverse()]);
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
            const [current, currentBlocks] = await Promise.all([contextReader.read(), traverse()]);
            if (controller.signal.aborted || !current || !currentBlocks
              || !matches(context, current) || !matches(context, currentBlocks)
              || JSON.stringify(blocks.collection) !== JSON.stringify(currentBlocks.collection)) return unavailable;
            const finalDenial = check(await prove());
            return finalDenial ?? blocks;
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
