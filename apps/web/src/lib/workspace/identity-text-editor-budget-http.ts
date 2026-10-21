import "server-only";
import { z } from "zod";
import { identityTextEditorBudgetPolicySchema } from "./identity-text-editor-budget-policy";
import { createIdentityTextEditorDistributedPermit } from "./identity-text-editor-budget";
import { createIdentityTextEditorUpstashBudgetTransport } from "./identity-text-editor-budget-upstash";
import { handleIdentityTextEditorCommandRequest } from "./identity-text-editor-http";

const configSchema = z.object({ trustedOrigin: z.string(), policy: identityTextEditorBudgetPolicySchema,
  upstash: z.object({ origin: z.string(), token: z.string() }).strict() }).strict();
type Dependencies = Pick<Parameters<typeof createIdentityTextEditorDistributedPermit>[0], "key" | "readTrustedMetadata"> & { fetcher?: typeof fetch };

/** Unmounted: trusted runtime provenance and actual session/CSRF evidence remain required. */
export function createBudgetedIdentityTextEditorHttpBoundary(config: z.infer<typeof configSchema>, { key, readTrustedMetadata, fetcher = fetch }: Dependencies) {
  const parsed = configSchema.safeParse(config);
  const permit = parsed.success ? createIdentityTextEditorDistributedPermit({ policy: parsed.data.policy, key, readTrustedMetadata,
    redis: createIdentityTextEditorUpstashBudgetTransport({ ...parsed.data.upstash, namespace: parsed.data.policy.namespace }, fetcher) }) : null;
  return (request: Request): Promise<Response> => handleIdentityTextEditorCommandRequest(request, parsed.success ? parsed.data.trustedOrigin : "",
    (action, signal) => permit ? permit(request, action, signal) : Promise.resolve(false));
}
