import "server-only";
import { createHash } from "node:crypto";
import { productClickBudgetScript } from "../public/product-click-budget";
import { createIdentityMediaEditorNetworkSubject } from "./identity-media-editor-budget-subject";
import { identityMediaEditorBudgetPolicySchema, identityMediaEditorCommandWorkCost, type IdentityMediaEditorBudgetPolicy } from "./identity-media-editor-budget-policy";

type Dependencies = Omit<Parameters<typeof createIdentityMediaEditorNetworkSubject>[0], "namespace"> & {
  policy: IdentityMediaEditorBudgetPolicy;
  redis: { eval: (script: string, keys: readonly string[], args: readonly string[]) => Promise<unknown> };
};

/** Network admission only; existing authenticated Owner authorization remains mandatory. */
export function createIdentityMediaEditorDistributedPermit({ policy, redis, key, readTrustedMetadata }: Dependencies) {
  const parsed = identityMediaEditorBudgetPolicySchema.safeParse(policy);
  const identity = parsed.success ? createIdentityMediaEditorNetworkSubject({ namespace: parsed.data.namespace, key, readTrustedMetadata }) : null;
  return async (request: Request, action: "identity_media_command", operationSignal: AbortSignal): Promise<boolean> => {
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    let resolveStop!: (value: false) => void;
    const stopped = new Promise<false>(resolve => { resolveStop = resolve; });
    const stop = () => { active = false; resolveStop(false); };
    const started = performance.now();
    const valid = () => { const now = performance.now(); return active && !request.signal.aborted && !operationSignal.aborted
      && Number.isFinite(now) && now >= started && now < started + 2000; };
    try {
      if (!parsed.success || !identity || action !== "identity_media_command" || !Number.isFinite(started) || !valid()) return false;
      request.signal.addEventListener("abort", stop, { once: true });
      operationSignal.addEventListener("abort", stop, { once: true });
      timer = setTimeout(stop, 2000);
      return await Promise.race([(async () => {
        const subject = await identity(request);
        if (!subject || !valid()) return false;
        const p = parsed.data;
        const digest = createHash("sha256").update(`${p.namespace}\0${subject}`).digest("hex");
        const base = `spall-identity-media-editor:${p.namespace}:{${digest}}`;
        const result = await redis.eval(productClickBudgetScript, [`${base}:command`, `${base}:work`],
          [String(p.window_ms), String(p.command_limit), String(p.work_limit), String(identityMediaEditorCommandWorkCost)]);
        return valid() && result === 1;
      })(), stopped]);
    } catch { return false; }
    finally {
      active = false; clearTimeout(timer);
      request.signal.removeEventListener("abort", stop); operationSignal.removeEventListener("abort", stop);
    }
  };
}
