import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResourceOpenAction } from "./resource-open-budget";
import { createPublishedResourceOpenIssuance } from "./resource-open-issuance";
import { readResourceOpenRequest, resourceOpenNoStoreHeaders, unavailableResourceOpenResponse } from "./resource-open-request";

async function resultWithinDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("unavailable")), 10000);
    })]);
  } finally { clearTimeout(timer); }
}

/** Unmounted JSON handlers. No credentials, public routes or permissive limiter. */
export function createResourceOpenHttpBoundary({ client, origin, permit }: {
  client: Pick<SupabaseClient, "schema">; origin: string;
  permit: (request: Request, action: ResourceOpenAction) => Promise<unknown>;
}) {
  const issuance = createPublishedResourceOpenIssuance(client);
  return {
    async issue(request: Request): Promise<Response> {
      try {
        const input = await readResourceOpenRequest(request, origin, "issue", permit);
        if (input === null || !("reference" in input) || request.signal.aborted) return unavailableResourceOpenResponse();
        const result = await resultWithinDeadline(issuance.issue(input));
        if (result === null || request.signal.aborted) return unavailableResourceOpenResponse();
        const headers = resourceOpenNoStoreHeaders(); headers.set("Content-Type", "application/json; charset=utf-8");
        return new Response(JSON.stringify(result), { status: 200, headers });
      } catch { return unavailableResourceOpenResponse(); }
    },
    async redeem(request: Request): Promise<Response> {
      try {
        const input = await readResourceOpenRequest(request, origin, "redeem", permit);
        if (input === null || !("token" in input) || request.signal.aborted) return unavailableResourceOpenResponse();
        const { token, ...context } = input;
        const source = await resultWithinDeadline(issuance.redeem(token, context));
        if (source === null || request.signal.aborted) return unavailableResourceOpenResponse();
        const headers = resourceOpenNoStoreHeaders(); headers.set("Location", source);
        return new Response(null, { status: 303, headers });
      } catch { return unavailableResourceOpenResponse(); }
    },
  };
}
