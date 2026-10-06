import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublishedProductClickIntentCore, type ProductClickIntentStore } from "./product-click-intent";
import type { readProductClickClock } from "./product-click-clock";

export function createCalibratedProductClickCore(client: Pick<SupabaseClient, "schema">, store: ProductClickIntentStore,
  clock: NonNullable<Awaited<ReturnType<typeof readProductClickClock>>>) {
  return createPublishedProductClickIntentCore({ store, now: clock.upperNow, issueNow: clock.lowerNow,
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
