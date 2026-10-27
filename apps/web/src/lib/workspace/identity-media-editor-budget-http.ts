import "server-only";
import { z } from "zod";
import { identityMediaEditorBudgetPolicySchema } from "./identity-media-editor-budget-policy";
import { createIdentityMediaEditorDistributedPermit } from "./identity-media-editor-budget";
import { createIdentityMediaEditorUpstashBudgetTransport } from "./identity-media-editor-budget-upstash";
import { handleIdentityMediaEditorCommandRequest } from "./identity-media-editor-http";

const configSchema = z.object({ trustedOrigin: z.string(), policy: identityMediaEditorBudgetPolicySchema,
  upstash: z.object({ origin: z.string(), token: z.string() }).strict() }).strict();
type Dependencies = Pick<Parameters<typeof createIdentityMediaEditorDistributedPermit>[0], "key" | "readTrustedMetadata"> & { fetcher?: typeof fetch };

/** Unmounted: trusted runtime provenance and actual session/CSRF evidence remain required. */
export function createBudgetedIdentityMediaEditorHttpBoundary(config: z.infer<typeof configSchema>, { key, readTrustedMetadata, fetcher = fetch }: Dependencies) {
  const parsed = configSchema.safeParse(config);
  const permit = parsed.success ? createIdentityMediaEditorDistributedPermit({ policy: parsed.data.policy, key, readTrustedMetadata,
    redis: createIdentityMediaEditorUpstashBudgetTransport({ ...parsed.data.upstash, namespace: parsed.data.policy.namespace }, fetcher) }) : null;
  return (request: Request): Promise<Response> => handleIdentityMediaEditorCommandRequest(request, parsed.success ? parsed.data.trustedOrigin : "",
    (action, signal) => permit ? permit(request, action, signal) : Promise.resolve(false));
}
