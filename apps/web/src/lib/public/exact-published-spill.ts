import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseExactSpillReferenceLocator } from "./exact-reference-locator";
import { publicSpillItemPayloadSchema, type PublicSpillItemPayload } from "./spill-item-contract";

/** Private locator-only resolution; no route, credential, navigation or action authority. */
export function createExactPublishedSpillResolver(client: Pick<SupabaseClient, "schema">) {
  return async (input: unknown): Promise<PublicSpillItemPayload | null> => {
    const locator = parseExactSpillReferenceLocator(input);
    if (locator === null) return null;
    const { handle, spill_reference } = locator;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read(): Promise<PublicSpillItemPayload | null> {
      const result = await client.schema("api").rpc("resolve_public_spill_item", {
        input_handle: handle, input_spill_reference: spill_reference,
      }).abortSignal(controller.signal);
      if (controller.signal.aborted || result.error !== null) return null;
      const parsed = publicSpillItemPayloadSchema.safeParse(result.data);
      if (!parsed.success || (parsed.data.status === "success"
        && parsed.data.detail.spill_reference !== spill_reference)) return null;
      return parsed.data;
    }
    try {
      return await Promise.race([read(), new Promise<null>(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000);
      })]);
    } catch { return null; }
    finally { clearTimeout(timer); }
  };
}
