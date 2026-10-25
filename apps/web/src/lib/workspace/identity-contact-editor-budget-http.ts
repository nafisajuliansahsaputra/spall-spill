import "server-only";
import { z } from "zod";
import { identityContactEditorBudgetPolicySchema } from "./identity-contact-editor-budget-policy";
import { createIdentityContactEditorDistributedPermit } from "./identity-contact-editor-budget";
import { createIdentityContactEditorUpstashBudgetTransport } from "./identity-contact-editor-budget-upstash";
import { handleIdentityContactEditorCommandRequest } from "./identity-contact-editor-http";

const configSchema = z.object({ trustedOrigin: z.string(), policy: identityContactEditorBudgetPolicySchema,
  upstash: z.object({ origin: z.string(), token: z.string() }).strict() }).strict();
type Dependencies = Pick<Parameters<typeof createIdentityContactEditorDistributedPermit>[0], "key" | "readTrustedMetadata"> & { fetcher?: typeof fetch };

/** Unmounted: trusted runtime provenance and actual session/CSRF evidence remain required. */
export function createBudgetedIdentityContactEditorHttpBoundary(config: z.infer<typeof configSchema>, { key, readTrustedMetadata, fetcher = fetch }: Dependencies) {
  const parsed = configSchema.safeParse(config);
  const permit = parsed.success ? createIdentityContactEditorDistributedPermit({ policy: parsed.data.policy, key, readTrustedMetadata,
    redis: createIdentityContactEditorUpstashBudgetTransport({ ...parsed.data.upstash, namespace: parsed.data.policy.namespace }, fetcher) }) : null;
  return (request: Request): Promise<Response> => handleIdentityContactEditorCommandRequest(request, parsed.success ? parsed.data.trustedOrigin : "",
    (action, signal) => permit ? permit(request, action, signal) : Promise.resolve(false));
}
