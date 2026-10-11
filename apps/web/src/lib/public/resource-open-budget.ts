import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { productClickBudgetScript } from "./product-click-budget";
export type ResourceOpenAction = "issue" | "redeem";

const positive = z.number().int().min(1).max(1000000);
const policySchema = z.object({ namespace: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  window_ms: z.number().int().min(1000).max(3600000), issue_limit: positive,
  redeem_limit: positive, work_limit: positive }).strict();
const subjectSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const costs = { issue: 4, redeem: 3 } as const;
type Operation = keyof typeof costs;
type Policy = z.infer<typeof policySchema>;
export type ResourceOpenBudgetRedis = {
  eval: (script: string, keys: readonly string[], args: readonly string[]) => Promise<unknown>;
};

/** Unmounted. Transport, operation, policy and identity resolver are server dependencies. */
export function createResourceOpenDistributedPermit({ operation, policy, redis, identity }: {
  operation: Operation; policy: Policy; redis: ResourceOpenBudgetRedis;
  identity: (request: Request) => Promise<unknown>;
}) {
  return async (request: Request, action: ResourceOpenAction): Promise<boolean> => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const started = performance.now();
      const timely = () => { const now = performance.now(); return Number.isFinite(now) && now >= started && now < started + 2000; };
      if (!Number.isFinite(started)) return false;
      const parsed = policySchema.safeParse(policy);
      if (!parsed.success || !Object.hasOwn(costs, operation) || request.signal.aborted) return false;
      const cost = costs[operation]; const expected = operation;
      if (action !== expected || parsed.data.work_limit < cost) return false;
      const run = async () => {
        const subject = subjectSchema.safeParse(await identity(request));
        if (!subject.success || !active || !timely() || request.signal.aborted) return false;
        const p = parsed.data;
        const digest = createHash("sha256").update(`${p.namespace}\0${subject.data}`).digest("hex");
        const base = `spall-resource-open:${p.namespace}:{${digest}}`;
        const result = await redis.eval(productClickBudgetScript, [`${base}:${expected}`, `${base}:work`],
          [String(p.window_ms), String(expected === "issue" ? p.issue_limit : p.redeem_limit), String(p.work_limit), String(cost)]);
        return active && timely() && !request.signal.aborted && result === 1;
      };
      return await Promise.race([run(), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 2000); })]);
    } catch { return false; }
    finally { active = false; clearTimeout(timer); }
  };
}
