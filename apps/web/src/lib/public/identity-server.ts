import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createIdentityTextEditorUpstashBudgetTransport } from "../workspace/identity-text-editor-budget-upstash";
import { productClickBudgetScript } from "./product-click-budget";
import { identityBindingSchema, publicIdentityPayloadSchema } from "./identity-contract";
import { publicHandleSchema } from "./locators";
import { publicIdentityOrigin } from "./identity-origin";

const openedSchema = z.object({ status: z.literal("success"), destination_url: z.string().max(2048) }).strict();
export async function admitPublicIdentity(operation: "read" | "open") {
  const deployment = process.env.SPALL_PUBLIC_IDENTITY_BUDGET_NAMESPACE;
  if (!deployment || !/^[a-z][a-z0-9-]{0,23}$/.test(deployment)) return false;
  const namespace = `public-identity-${operation}-${deployment}`;
  const redis = createIdentityTextEditorUpstashBudgetTransport({ namespace,
    origin: process.env.UPSTASH_REDIS_REST_URL ?? "", token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "" });
  // Shared ceiling: callers cannot mint fresh buckets via IP, handle or cookies.
  const digest = createHash("sha256").update("public-identity-aggregate-v1").digest("hex");
  const base = `spall-identity-text-editor:${namespace}:{${digest}}`;
  const limit = operation === "read" ? 600 : 60;
  return await redis.eval(productClickBudgetScript, [`${base}:command`, `${base}:work`],
    ["60000", String(limit), String(limit * 13), "13"]) === 1;
}
async function execute(operation: "read" | "open", handle: unknown, binding: string | null = null) {
  const locator = publicHandleSchema.safeParse(handle);
  if (!locator.success) return { status: "unavailable" };
  if (process.env.SPALL_PUBLIC_IDENTITY_ENABLED !== "true" || !publicIdentityOrigin(process.env.SPALL_PUBLIC_ORIGIN) || !await admitPublicIdentity(operation)) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = async () => {
      const client = createSupabaseServiceClient((input, init) => fetch(input, { ...init, cache: "no-store", redirect: "error" }));
      const result = await client.schema("api").rpc("execute_public_identity_server", {
        input_operation: operation, input_handle: locator.data, input_binding: binding,
      }).abortSignal(controller.signal);
      return !controller.signal.aborted && !result.error ? result.data as unknown : null;
    };
    return await Promise.race([run(), new Promise<null>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000);
    })]);
  } catch { return null; }
  finally { clearTimeout(timer); controller.abort(); }
}
export async function readPublicIdentity(handle: unknown) {
  const result = publicIdentityPayloadSchema.safeParse(await execute("read", handle));
  return result.success ? result.data : null;
}
export async function openPublicIdentityConnection(handle: unknown, binding: unknown): Promise<string | null> {
  if (!identityBindingSchema.safeParse(binding).success) return null;
  const result = openedSchema.safeParse(await execute("open", handle, binding as string));
  if (!result.success) return null;
  try {
    const safe = normalizeExternalDestination(result.data.destination_url);
    return safe.normalizedUrl === result.data.destination_url ? safe.normalizedUrl : null;
  } catch { return null; }
}
