import "server-only";
import { z } from "zod";

/** Conservative DB-RPC units for any selected Text command; not a body or Owner quota. */
export const identityTextEditorCommandWorkCost = 13;
const positive = z.number().int().min(1).max(1000000);
export const identityTextEditorBudgetPolicySchema = z.object({
  namespace: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  window_ms: z.number().int().min(1000).max(3600000),
  command_limit: positive,
  work_limit: positive.min(identityTextEditorCommandWorkCost),
}).strict();
export type IdentityTextEditorBudgetPolicy = z.infer<typeof identityTextEditorBudgetPolicySchema>;
