import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { publicProductSchema } from "./product-contract";
import { publishedProductDestinationRequestSchema, validatePublishedProductDestinationResult } from "./product-destination";
import { createProductClickIntentRpcAdapter } from "./product-click-intent-store";
import { createCalibratedProductClickCore } from "./product-click-calibrated-core";
import { readProductClickClock } from "./product-click-clock";

const locatorSchema = z.object({ handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
const contextSchema = z.object({ status: z.literal("success"), confirmation: publicProductSchema,
  binding: publishedProductDestinationRequestSchema }).strict();
type Context = z.infer<typeof contextSchema>;
function sameSnapshot(a: Context, b: Context): boolean {
  const x = a.confirmation; const y = b.confirmation;
  return a.binding.publication_token === b.binding.publication_token
    && x.current_handle === y.current_handle && x.spill_reference === y.spill_reference
    && x.display_name === y.display_name && x.title === y.title && x.primary_image_path === y.primary_image_path
    && x.destinations.length === y.destinations.length && x.destinations.every((d, i) => {
      const other = y.destinations[i]!;
      return d.provider_key === other.provider_key
        && (d.destination_url === null || other.destination_url === null || d.destination_url === other.destination_url);
    });
}

/** Locator-only private assembly. No route, permission, credential or browser fetch. */
export function createProductClickConfirmationBundle(client: Pick<SupabaseClient, "schema">,
  readClock = () => readProductClickClock(client)) {
  const adapter = createProductClickIntentRpcAdapter(client);
  return async (locator: unknown) => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    async function run() {
      const request = locatorSchema.safeParse(locator);
      if (!request.success) return null;
      const projection = await client.schema("api").rpc("resolve_public_product", {
        input_handle: request.data.handle, input_spill_reference: request.data.spill_reference,
      });
      const parsed = publicProductSchema.safeParse(projection.data);
      if (!active || projection.error !== null || !parsed.success || parsed.data.spill_reference !== request.data.spill_reference) return null;
      const discovered = parsed.data;
      const contexts: Context[] = [];
      for (const destination of discovered.destinations.filter(d => d.available)) {
        if (!active) return null;
        try {
          const result = await client.schema("api").rpc("resolve_published_product_click_context_server", {
            input_handle: discovered.current_handle, input_spill_reference: discovered.spill_reference,
            input_provider_key: destination.provider_key,
          });
          const c = contextSchema.safeParse(result.data);
          if (result.error !== null || !c.success) continue;
          const { binding, confirmation } = c.data;
          const selected = confirmation.destinations.find(d => d.provider_key === destination.provider_key);
          if (binding.provider_key !== destination.provider_key || binding.handle !== discovered.current_handle
            || confirmation.current_handle !== binding.handle || binding.spill_reference !== discovered.spill_reference
            || confirmation.spill_reference !== binding.spill_reference || !selected?.available
            || validatePublishedProductDestinationResult(binding, { status: "success", destination_url: selected.destination_url }) === null) continue;
          contexts.push(c.data);
        } catch { /* This provider has no usable issuance context. */ }
      }
      if (!active) return null;
      const anchor = contexts[0];
      if (!anchor) return { confirmation: discovered, intents: [] };
      if (contexts.some(c => !sameSnapshot(anchor, c))) return { confirmation: anchor.confirmation, intents: [] };
      const clock = await readClock();
      if (!active || clock === null) return null;
      const started = clock.lowerNow();
      if (!Number.isSafeInteger(started) || started < 0) return null;
      const core = createCalibratedProductClickCore(client, { consume: adapter.store.consume,
        create: (hash, record) => active ? adapter.store.create(hash, record) : Promise.resolve(false) }, clock);
      const intents: { provider_key: string; token: string }[] = [];
      for (const destination of anchor.confirmation.destinations.filter(d => d.available)) {
        if (!active) return null;
        const context = contexts.find(c => c.binding.provider_key === destination.provider_key);
        if (!context) continue;
        const token = await core.issue(anchor.confirmation, context.binding);
        if (token !== null) intents.push({ provider_key: destination.provider_key, token });
      }
      const decided = clock.upperNow();
      if (!active || !Number.isSafeInteger(decided) || decided < started || decided >= started + 120_000) return null;
      return { confirmation: anchor.confirmation, intents };
    }
    try {
      return await Promise.race([run(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 10000); })]);
    } catch { return null; }
    finally { active = false; clearTimeout(timer); }
  };
}
