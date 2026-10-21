import "server-only";
import { createTrustedNetworkBudgetSubject } from "../public/network-budget-subject";

type Dependencies = Omit<Parameters<typeof createTrustedNetworkBudgetSubject>[0], "domain">;

/** Unmounted: actual deployed metadata provenance remains an activation gate. */
export function createIdentityTextEditorNetworkSubject(dependencies: Dependencies) {
  return createTrustedNetworkBudgetSubject({ ...dependencies, domain: "spall-identity-text-editor-network-subject-v1" });
}
