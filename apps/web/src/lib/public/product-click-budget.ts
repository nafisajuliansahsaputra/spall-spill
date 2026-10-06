import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProductClickAction } from "./product-click-request";

export const productClickBudgetScript = `
redis.replicate_commands()
local window = tonumber(ARGV[1])
local actionLimit = tonumber(ARGV[2])
local workLimit = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local bucket = math.floor(now / window)
local function read(key)
  local state = redis.call('HMGET', key, 'bucket', 'count', 'at')
  if not state[1] and not state[2] and not state[3] then return 0 end
  if not state[1] or not state[2] or not state[3] or not string.match(state[1], '^[0-9]+$') or not string.match(state[2], '^[0-9]+$') or not string.match(state[3], '^[0-9]+$') then return nil end
  local b = tonumber(state[1])
  local n = tonumber(state[2])
  local at = tonumber(state[3])
  if state[1] ~= tostring(b) or state[2] ~= tostring(n) or state[3] ~= tostring(at) then return nil end
  if at ~= math.floor(at) or at > now or math.floor(at / window) ~= b then return nil end
  if b ~= math.floor(b) or b > bucket or n ~= math.floor(n) or n > 1000000 then return nil end
  if b < bucket then return 0 end
  return n
end
local actions = read(KEYS[1])
local work = read(KEYS[2])
if not actions or not work or actions + 1 > actionLimit or work + cost > workLimit then return 0 end
local ttl = (bucket + 1) * window - now + 1000
redis.call('HMSET', KEYS[1], 'bucket', bucket, 'count', actions + 1, 'at', now)
redis.call('HMSET', KEYS[2], 'bucket', bucket, 'count', work + cost, 'at', now)
redis.call('PEXPIRE', KEYS[1], ttl)
redis.call('PEXPIRE', KEYS[2], ttl)
return 1
`;
const positive = z.number().int().min(1).max(1000000);
const policySchema = z.object({ namespace: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  window_ms: z.number().int().min(1000).max(3600000), issue_limit: positive,
  redeem_limit: positive, work_limit: positive }).strict();
const subjectSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
const costs = { issue: 4, bundle: 32, redeem: 3 } as const;
type Operation = keyof typeof costs;
type Policy = z.infer<typeof policySchema>;
export type ProductClickBudgetRedis = {
  eval: (script: string, keys: readonly string[], args: readonly string[]) => Promise<unknown>;
};

/** Unmounted. Transport, operation, policy and identity resolver are server dependencies. */
export function createProductClickDistributedPermit({ operation, policy, redis, identity }: {
  operation: Operation; policy: Policy; redis: ProductClickBudgetRedis;
  identity: (request: Request) => Promise<unknown>;
}) {
  return async (request: Request, action: ProductClickAction): Promise<boolean> => {
    let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const started = performance.now();
      const timely = () => { const now = performance.now(); return Number.isFinite(now) && now >= started && now < started + 2000; };
      if (!Number.isFinite(started)) return false;
      const parsed = policySchema.safeParse(policy);
      if (!parsed.success || !Object.hasOwn(costs, operation) || request.signal.aborted) return false;
      const cost = costs[operation]; const expected = operation === "redeem" ? "redeem" : "issue";
      if (action !== expected || parsed.data.work_limit < cost) return false;
      const run = async () => {
        const subject = subjectSchema.safeParse(await identity(request));
        if (!subject.success || !active || !timely() || request.signal.aborted) return false;
        const p = parsed.data;
        const digest = createHash("sha256").update(`${p.namespace}\0${subject.data}`).digest("hex");
        const base = `spall-click:${p.namespace}:{${digest}}`;
        const result = await redis.eval(productClickBudgetScript, [`${base}:${expected}`, `${base}:work`],
          [String(p.window_ms), String(expected === "issue" ? p.issue_limit : p.redeem_limit), String(p.work_limit), String(cost)]);
        return active && timely() && !request.signal.aborted && result === 1;
      };
      return await Promise.race([run(), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 2000); })]);
    } catch { return false; }
    finally { active = false; clearTimeout(timer); }
  };
}
