import "server-only";
import { createResourceOpenDistributedPermit } from "./resource-open-budget";
import { createResourceOpenHttpBoundary } from "./resource-open-http";

type BudgetDependencies = Omit<Parameters<typeof createResourceOpenDistributedPermit>[0], "operation">;
type HttpDependencies = Omit<Parameters<typeof createResourceOpenHttpBoundary>[0], "permit">;

/** Unmounted. Each handler selects its own budget; runtime identity provenance remains required. */
export function createBudgetedResourceOpenHttpBoundary({ client, origin, ...budget }: BudgetDependencies & HttpDependencies) {
  const compose = (operation: "issue" | "redeem") => createResourceOpenHttpBoundary({ client, origin,
    permit: createResourceOpenDistributedPermit({ ...budget, operation }) });
  const issuance = compose("issue"); const redemption = compose("redeem");
  return { issue: issuance.issue, redeem: redemption.redeem, redeemForm: redemption.redeemForm };
}
