import "server-only";
import { z } from "zod";
import { createIdentityLinkEditorDistributedPermit, identityLinkEditorBudgetPolicySchema } from "./identity-link-editor-budget";
import { createIdentityLinkEditorUpstashBudgetTransport } from "./identity-link-editor-budget-upstash";
import { handleIdentityLinkEditorCommandRequest } from "./identity-link-editor-http";

const configSchema = z.object({ trustedOrigin: z.string(), policy: identityLinkEditorBudgetPolicySchema,
  upstash: z.object({ origin: z.string(), token: z.string() }).strict() }).strict();
type Dependencies = Pick<Parameters<typeof createIdentityLinkEditorDistributedPermit>[0], "key" | "readTrustedMetadata"> & { fetcher?: typeof fetch };

/** Unmounted: trusted runtime provenance and actual session/CSRF evidence remain required. */
export function createBudgetedIdentityLinkEditorHttpBoundary(config: z.infer<typeof configSchema>, { key, readTrustedMetadata, fetcher = fetch }: Dependencies) {
  const parsed = configSchema.safeParse(config);
  const permit = parsed.success ? createIdentityLinkEditorDistributedPermit({ policy: parsed.data.policy, key, readTrustedMetadata,
    redis: createIdentityLinkEditorUpstashBudgetTransport({ ...parsed.data.upstash, namespace: parsed.data.policy.namespace }, fetcher) }) : null;
  return (request: Request): Promise<Response> => handleIdentityLinkEditorCommandRequest(request, parsed.success ? parsed.data.trustedOrigin : "",
    (action, signal) => permit ? permit(request, action, signal) : Promise.resolve(false));
}
