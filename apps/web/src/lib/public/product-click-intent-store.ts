import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productClickIntentRecordSchema, type ProductClickIntentStore } from "./product-click-intent";

const validHash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function parseRecord(value: unknown) {
  const parsed = productClickIntentRecordSchema.safeParse(value);
  // Stored records are canonical; do not repair/normalize an RPC response.
  if (!parsed.success || typeof value !== "object" || value === null
    || !("binding" in value) || typeof value.binding !== "object" || value.binding === null
    || !("handle" in value.binding) || value.binding.handle !== parsed.data.binding.handle) return null;
  return parsed.data;
}

/** Staged only: all three RPC grants remain withheld. No credentials or retries. */
export function createProductClickIntentRpcAdapter(client: Pick<SupabaseClient, "schema">): {
  store: ProductClickIntentStore;
  cleanup(limit: number): Promise<number | null>;
} {
  return {
    store: {
      async create(tokenHash, record) {
        try {
          const parsed = parseRecord(record);
          if (!validHash(tokenHash) || parsed === null) return false;
          const { data, error } = await client.schema("api").rpc("create_product_click_intent_server", {
            input_token_hash: tokenHash, input_record: parsed,
          });
          return error === null && data === true;
        } catch { return false; }
      },
      async consume(tokenHash) {
        try {
          if (!validHash(tokenHash)) return null;
          // Standalone RPC response completes before any core destination resolution.
          const { data, error } = await client.schema("api").rpc("consume_product_click_intent_server", {
            input_token_hash: tokenHash,
          });
          return error === null ? parseRecord(data) : null;
        } catch { return null; }
      },
    },
    async cleanup(limit) {
      try {
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) return null;
        const { data, error } = await client.schema("api").rpc("cleanup_product_click_intents_server", {
          input_limit: limit,
        });
        return error === null && typeof data === "number" && Number.isInteger(data)
          && data >= 0 && data <= limit ? data : null;
      } catch { return null; }
    },
  };
}
