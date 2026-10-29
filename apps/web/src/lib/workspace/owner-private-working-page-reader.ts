import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { identityBlockPageRequestSchema } from "./identity-block-page-request";

type Denial = { status: "unavailable" | "invalid_page_request" | "stale_read" };
type Reply = Denial | { status: "success"; collection: null | { revision: number; blocks: { position: number }[] } };
type Rpc = "resolve_current_owner_typed_blocks_working_page" | "resolve_current_owner_identity_working_page"
  | "resolve_current_owner_editable_identity_working_page";

/** Internal fixed adapters supply RPC and decoder; request callers cannot choose either. */
export function createOwnerPrivateWorkingPageReader<T extends Reply>(client: Pick<SupabaseClient, "schema">,
  rpc: Rpc, parse: (value: unknown) => { success: true; data: T } | { success: false }) {
  return {
    async read(value: unknown): Promise<T | Denial> {
      const request = identityBlockPageRequestSchema.safeParse(value);
      if (!request.success) return { status: "invalid_page_request" };
      const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
      const unavailable = (): Denial => ({ status: "unavailable" });
      try {
        return await Promise.race([
          (async (): Promise<T | Denial> => {
            const reply = await client.schema("api").rpc(rpc, { input_request: request.data }).abortSignal(controller.signal);
            if (controller.signal.aborted || reply.error !== null
              || Buffer.byteLength(JSON.stringify(reply.data), "utf8") > 8388608) return unavailable();
            const parsed = parse(reply.data);
            if (!parsed.success) return unavailable();
            if (parsed.data.status === "success" && request.data.after_position !== null) {
              const page = parsed.data.collection;
              if (page === null || page.revision !== request.data.expected_collection_revision
                || page.blocks.some(row => row.position <= request.data.after_position!)) return unavailable();
            }
            return parsed.data;
          })(),
          new Promise<Denial>(resolve => { timer = setTimeout(() => {
            controller.abort(); resolve(unavailable());
          }, 5000); }),
        ]);
      } catch { return unavailable(); }
      finally { clearTimeout(timer); }
    },
  };
}
