import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseExactSpillReferenceLocator } from "./exact-reference-locator";
import { parsePublishedResourceServerContext, type PublishedResourceServerContext } from "./resource-server-context";
import { publishedResourceSourceRequestSchema, validatePublishedResourceSourceResult } from "./resource-source";

const unavailableSchema = z.object({ status: z.literal("unavailable") }).strict();
type ContextResult = PublishedResourceServerContext | z.infer<typeof unavailableSchema>;

async function boundedRead<T>(read: (signal: AbortSignal) => Promise<T | null>): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read(controller.signal), new Promise<null>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000);
    })]);
  } catch { return null; }
  finally { clearTimeout(timer); }
}

/** Unmounted private RPC boundary; bindings must come from trusted server context, never browser input. */
export function createPublishedResourceRpcAdapter(client: Pick<SupabaseClient, "schema">) {
  return {
    async readContext(input: unknown): Promise<ContextResult | null> {
      const locator = parseExactSpillReferenceLocator(input);
      if (locator === null) return null;
      return boundedRead(async signal => {
        const result = await client.schema("api").rpc("resolve_published_resource_context_server", {
          input_handle: locator.handle, input_spill_reference: locator.spill_reference,
        }).abortSignal(signal);
        if (signal.aborted || result.error !== null) return null;
        const unavailable = unavailableSchema.safeParse(result.data);
        return unavailable.success ? unavailable.data : parsePublishedResourceServerContext({
          handle: locator.handle, reference: String(locator.spill_reference),
        }, result.data);
      });
    },
    async resolveSource(serverBinding: unknown): Promise<string | null> {
      try {
        const parsed = publishedResourceSourceRequestSchema.safeParse(serverBinding);
        if (!parsed.success) return null;
        const binding = parsed.data;
        return await boundedRead(async signal => {
          const result = await client.schema("api").rpc("resolve_published_resource_source_server", {
            input_handle: binding.handle, input_spill_reference: binding.spill_reference,
            input_publication_token: binding.publication_token, input_source_hash: binding.source_hash,
          }).abortSignal(signal);
          if (signal.aborted || result.error !== null) return null;
          return validatePublishedResourceSourceResult(binding, result.data);
        });
      } catch { return null; }
    },
  };
}
