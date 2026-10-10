import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resourceOpenIntentRecordSchema, type ResourceOpenIntentStore } from "./resource-open-intent";

const validHash = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function parseRecord(value: unknown) {
  const parsed = resourceOpenIntentRecordSchema.safeParse(value);
  // Stored records are canonical; do not repair/normalize an RPC response.
  if (!parsed.success || typeof value !== "object" || value === null
    || !("binding" in value) || typeof value.binding !== "object" || value.binding === null
    || !("handle" in value.binding) || value.binding.handle !== parsed.data.binding.handle) return null;
  return parsed.data;
}

async function boundedRequest<T>(request: (signal: AbortSignal) => Promise<T | null>): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request(controller.signal), new Promise<null>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000);
    })]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/** Staged only: all three RPC grants remain withheld. No credentials or retries. */
export function createResourceOpenIntentRpcAdapter(client: Pick<SupabaseClient, "schema">): {
  store: ResourceOpenIntentStore;
  cleanup(limit: number): Promise<number | null>;
} {
  return {
    store: {
      async create(tokenHash, record) {
        try {
          const parsed = parseRecord(record);
          if (!validHash(tokenHash) || parsed === null) return false;
          return await boundedRequest(async signal => {
            const { data, error } = await client.schema("api").rpc("create_resource_open_intent_server", {
              input_token_hash: tokenHash, input_record: parsed,
            }).abortSignal(signal);
            return !signal.aborted && error === null && data === true;
          }) === true;
        } catch { return false; }
      },
      async consume(tokenHash) {
        try {
          if (!validHash(tokenHash)) return null;
          // Standalone RPC response completes before any core source resolution.
          return await boundedRequest(async signal => {
            const { data, error } = await client.schema("api").rpc("consume_resource_open_intent_server", {
              input_token_hash: tokenHash,
            }).abortSignal(signal);
            return !signal.aborted && error === null ? parseRecord(data) : null;
          });
        } catch { return null; }
      },
    },
    async cleanup(limit) {
      try {
        if (!Number.isInteger(limit) || limit < 1 || limit > 500) return null;
        return await boundedRequest(async signal => {
          const { data, error } = await client.schema("api").rpc("cleanup_resource_open_intents_server", {
            input_limit: limit,
          }).abortSignal(signal);
          return !signal.aborted && error === null && typeof data === "number" && Number.isInteger(data)
            && data >= 0 && data <= limit ? data : null;
        });
      } catch { return null; }
    },
  };
}
