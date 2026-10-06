import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { providerKeySchema } from "./product-contract";
import { createPublishedProductClickIssuance } from "./product-click-issuance";
import { readProductClickRequest, readProductClickFormRequest, productClickNoStoreHeaders, unavailableProductClickResponse, type ProductClickAction } from "./product-click-request";

const locator = z.object({ handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), provider_key: providerKeySchema }).strict();
const redemption = locator.extend({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
  .refine(token => Buffer.from(token, "base64url").toString("base64url") === token) }).strict();
async function resultWithinDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("unavailable")), 10000);
    })]);
  } finally { clearTimeout(timer); }
}

/** Unmounted handlers. No environment credentials, public routes or permissive limiter. */
export function createProductClickHttpBoundary({ client, origin, permit }: {
  client: Pick<SupabaseClient, "schema">; origin: string;
  permit: (request: Request, action: ProductClickAction) => Promise<unknown>;
}) {
  const issuance = createPublishedProductClickIssuance(client);
  async function redeem(request: Request, native: boolean): Promise<Response> {
    try {
      const permitAction = (action: ProductClickAction) => permit(request, action);
      const input = native ? await readProductClickFormRequest(request, origin, permitAction)
        : await readProductClickRequest(request, origin, "redeem", permitAction);
      const body = redemption.safeParse(input);
      if (!body.success || request.signal.aborted) return unavailableProductClickResponse();
      const { token, ...context } = body.data;
      const destination = await resultWithinDeadline(issuance.redeem(token, context));
      if (destination === null || request.signal.aborted) return unavailableProductClickResponse();
      const headers = productClickNoStoreHeaders(); headers.set("Location", destination);
      return new Response(null, { status: 303, headers });
    } catch { return unavailableProductClickResponse(); }
  }
  return {
    async issue(request: Request): Promise<Response> {
      try {
        const body = locator.safeParse(await readProductClickRequest(request, origin, "issue", action => permit(request, action)));
        if (!body.success || request.signal.aborted) return unavailableProductClickResponse();
        const result = await resultWithinDeadline(issuance.issue(body.data));
        if (result === null || request.signal.aborted) return unavailableProductClickResponse();
        const headers = productClickNoStoreHeaders(); headers.set("Content-Type", "application/json; charset=utf-8");
        return new Response(JSON.stringify(result), { status: 200, headers });
      } catch { return unavailableProductClickResponse(); }
    },
    redeem: (request: Request) => redeem(request, false),
    redeemForm: (request: Request) => redeem(request, true),
  };
}
