import "server-only";
import { createTrustedNetworkBudgetSubject } from "./network-budget-subject";

type Dependencies = Omit<Parameters<typeof createTrustedNetworkBudgetSubject>[0], "domain">;

/** Unmounted; Product domain and trusted metadata rules remain exact under 12.43. */
export function createProductClickNetworkSubject(dependencies: Dependencies) {
  return createTrustedNetworkBudgetSubject({ ...dependencies, domain: "spall-click-network-subject-v1" });
}
