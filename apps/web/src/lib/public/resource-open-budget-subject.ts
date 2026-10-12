import "server-only";
import { createTrustedNetworkBudgetSubject } from "./network-budget-subject";

type Dependencies = Omit<Parameters<typeof createTrustedNetworkBudgetSubject>[0], "domain">;

/** Unmounted; injected reader provenance must be evidenced before deployment. */
export function createResourceOpenNetworkSubject(dependencies: Dependencies) {
  return createTrustedNetworkBudgetSubject({ ...dependencies, domain: "spall-resource-open-network-subject-v1" });
}
