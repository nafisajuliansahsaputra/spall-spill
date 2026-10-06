import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createProductClickDistributedPermit } from "./product-click-budget";
import { createProductClickHttpBoundary } from "./product-click-http";
type Dependencies = Omit<Parameters<typeof createProductClickDistributedPermit>[0], "operation">;

/** Unmounted, handler-selected costs. Requires trusted deployment identity/policy/Redis. */
export function createBudgetedProductClickHttpBoundary({ client, origin, ...budget }: Dependencies & {
  client: Pick<SupabaseClient, "schema">; origin: string;
}) {
  const compose = (operation: "issue" | "bundle" | "redeem") => createProductClickHttpBoundary({ client, origin,
    permit: createProductClickDistributedPermit({ ...budget, operation }) });
  const issuance = compose("issue"); const bundle = compose("bundle"); const redemption = compose("redeem");
  return { issue: issuance.issue, issueBundle: bundle.issueBundle, redeem: redemption.redeem, redeemForm: redemption.redeemForm };
}
