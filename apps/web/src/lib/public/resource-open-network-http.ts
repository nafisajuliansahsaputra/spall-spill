import "server-only";
import { createBudgetedResourceOpenHttpBoundary } from "./resource-open-budget-http";
import { createResourceOpenNetworkSubject } from "./resource-open-budget-subject";

type HttpDependencies = Omit<Parameters<typeof createBudgetedResourceOpenHttpBoundary>[0], "identity">;
type SubjectDependencies = Pick<Parameters<typeof createResourceOpenNetworkSubject>[0], "key" | "readTrustedMetadata">;

/** Unmounted. Actual proxy/reader provenance remains a mandatory enabling gate. */
export function createNetworkBudgetedResourceOpenHttpBoundary({ key, readTrustedMetadata, ...dependencies }: HttpDependencies & SubjectDependencies) {
  const policy = dependencies.policy && { ...dependencies.policy };
  const identity = createResourceOpenNetworkSubject({ namespace: policy?.namespace, key, readTrustedMetadata });
  return createBudgetedResourceOpenHttpBoundary({ ...dependencies, policy, identity });
}
