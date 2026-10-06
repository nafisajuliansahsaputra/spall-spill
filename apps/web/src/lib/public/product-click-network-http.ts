import "server-only";
import { createBudgetedProductClickHttpBoundary } from "./product-click-budget-http";
import { createProductClickNetworkSubject } from "./product-click-budget-subject";

type HttpDependencies = Omit<Parameters<typeof createBudgetedProductClickHttpBoundary>[0], "identity">;
type SubjectDependencies = Pick<Parameters<typeof createProductClickNetworkSubject>[0], "key" | "readTrustedMetadata">;

/** Unmounted. Runtime reader provenance remains a separate mandatory deployment gate. */
export function createNetworkBudgetedProductClickHttpBoundary({ key, readTrustedMetadata, ...dependencies }: HttpDependencies & SubjectDependencies) {
  const policy = dependencies.policy && { ...dependencies.policy };
  const identity = createProductClickNetworkSubject({ namespace: policy?.namespace, key, readTrustedMetadata });
  return createBudgetedProductClickHttpBoundary({ ...dependencies, policy, identity });
}
