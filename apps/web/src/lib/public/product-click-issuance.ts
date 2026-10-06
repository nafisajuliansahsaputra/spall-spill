import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { providerKeySchema, publicProductSchema } from "./product-contract";
import { publishedProductDestinationRequestSchema } from "./product-destination";
import { createPublishedProductClickIntentCore } from "./product-click-intent";
import { createProductClickIntentRpcAdapter } from "./product-click-intent-store";
import { readProductClickClock } from "./product-click-clock";

const locatorSchema = z.object({
  handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  provider_key: providerKeySchema,
}).strict();
const contextSchema = z.object({
  status: z.literal("success"), confirmation: publicProductSchema,
  binding: publishedProductDestinationRequestSchema,
}).strict();

/** Private staged assembly. No credentials, route, browser bindings or execution grants. */
export function createPublishedProductClickIssuance(client: Pick<SupabaseClient, "schema">, readClock = () => readProductClickClock(client)) {
  const adapter = createProductClickIntentRpcAdapter(client);
  function core(clock: NonNullable<Awaited<ReturnType<typeof readProductClickClock>>>) {
    return createPublishedProductClickIntentCore({ store: adapter.store, now: clock.upperNow, issueNow: clock.lowerNow,
      async resolve(binding) {
        const { data, error } = await client.schema("api").rpc("resolve_published_product_destination_server", {
          input_handle: binding.handle, input_spill_reference: binding.spill_reference,
          input_provider_key: binding.provider_key, input_publication_token: binding.publication_token,
          input_destination_hash: binding.destination_hash,
        });
        return error === null ? data : null;
      },
      async resolveConsumed(record) {
        const { data, error } = await client.schema("api").rpc("resolve_product_click_intent_destination_server", {
          input_record: record,
        });
        return error === null ? data : null;
      },
    });
  }
  return {
    async issue(locator: unknown) {
      try {
        const request = locatorSchema.safeParse(locator);
        if (!request.success) return null;
        const { data, error } = await client.schema("api").rpc("resolve_published_product_click_context_server", {
          input_handle: request.data.handle, input_spill_reference: request.data.spill_reference,
          input_provider_key: request.data.provider_key,
        });
        const context = contextSchema.safeParse(data);
        if (error !== null || !context.success) return null;
        const { binding, confirmation } = context.data;
        if (binding.spill_reference !== request.data.spill_reference
          || binding.provider_key !== request.data.provider_key) return null;
        const clock = await readClock();
        if (clock === null) return null;
        const token = await core(clock).issue(confirmation, binding);
        return token === null ? null : { confirmation, token };
      } catch { return null; }
    },
    async redeem(token: unknown, expectedContext: unknown) {
      try {
        const clock = await readClock();
        return clock === null ? null : await core(clock).redeem(token, expectedContext);
      } catch { return null; }
    },
    cleanup: adapter.cleanup,
  };
}
