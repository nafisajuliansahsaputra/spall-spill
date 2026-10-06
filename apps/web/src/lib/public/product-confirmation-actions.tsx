import "server-only";
import { z } from "zod";
import { PublishedProductConfirmation } from "./product-confirmation";
import { providerKeySchema, publicProductSchema } from "./product-contract";

const intentSchema = z.object({ provider_key: providerKeySchema,
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
    .refine(token => Buffer.from(token, "base64url").toString("base64url") === token) }).strict();
const bundleSchema = z.object({ confirmation: publicProductSchema,
  intents: z.array(intentSchema).max(10).refine(intents =>
    new Set(intents.map(i => i.provider_key)).size === intents.length
    && new Set(intents.map(i => i.token)).size === intents.length) }).strict();
function label(provider: string): string {
  if (provider === "shopee") return "Shopee";
  if (provider === "tokopedia") return "Tokopedia";
  if (provider === "tiktok") return "TikTok Shop";
  return provider.slice("external:".length);
}

/** Trusted server props only. Does not issue authority, fetch data or mount transport. */
export function PublishedProductConfirmationActions({ payload }: { payload: unknown }) {
  const parsed = bundleSchema.safeParse(payload);
  if (!parsed.success) return <PublishedProductConfirmation payload={{ status: "unavailable" }} />;
  const { confirmation, intents } = parsed.data;
  const tokens = new Map(intents.map(i => [i.provider_key, i.token]));
  const actions = confirmation.destinations.filter(d => d.available && tokens.has(d.provider_key));
  return <div>
    <PublishedProductConfirmation payload={confirmation} />
    <section aria-label="Marketplace actions" className="mx-auto max-w-3xl space-y-3 px-5 pb-5">
      {actions.length > 1 ? <h2 className="text-lg font-semibold">Choose marketplace</h2> : null}
      {actions.map(destination => <form key={destination.provider_key} action="/actions/product-click"
        method="post" encType="application/x-www-form-urlencoded" acceptCharset="UTF-8" target="_self">
        <input type="hidden" name="handle" value={confirmation.current_handle} />
        <input type="hidden" name="spill_reference" value={String(confirmation.spill_reference)} />
        <input type="hidden" name="provider_key" value={destination.provider_key} />
        <input type="hidden" name="token" value={tokens.get(destination.provider_key)!} />
        <button type="submit" className="min-h-11 w-full rounded-xl border px-4 py-3 text-left font-semibold">
          Open in {label(destination.provider_key)}
        </button>
      </form>)}
      {actions.length > 0 && actions.length < confirmation.destinations.length
        ? <p role="status">Some marketplace destinations are temporarily unavailable.</p> : null}
      {actions.length === 0 && confirmation.destinations.some(d => d.available)
        ? <p role="status">Marketplace destinations are temporarily unavailable.</p> : null}
    </section>
  </div>;
}
