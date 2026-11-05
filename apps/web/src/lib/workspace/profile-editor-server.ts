import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createIdentityTextEditorUpstashBudgetTransport } from "./identity-text-editor-budget-upstash";
import { productClickBudgetScript } from "../public/product-click-budget";

const subjectSchema = z.string().uuid();
const operations = new Set(["resolve_current_owner_home_context", "resolve_current_owner_editable_identity_working_page", "save_current_owner_profile_text_working"]);
/** Atomic action-specific distributed quota; no process-local fallback. */
export async function admitProfileEditor(subject: string, save: boolean) {
  const deployment = process.env.SPALL_OWNER_PROFILE_BUDGET_NAMESPACE;
  if (!subjectSchema.safeParse(subject).success || !deployment || !/^[a-z][a-z0-9-]{0,23}$/.test(deployment)) return false;
  const namespace = `profile-${save ? "save" : "read"}-${deployment}`;
  const redis = createIdentityTextEditorUpstashBudgetTransport({ namespace,
    origin: process.env.UPSTASH_REDIS_REST_URL ?? "", token: process.env.UPSTASH_REDIS_REST_TOKEN ?? "" });
  const digest = createHash("sha256").update(subject).digest("hex");
  const base = `spall-identity-text-editor:${namespace}:{${digest}}`;
  const limit = save ? 30 : 600;
  return await redis.eval(productClickBudgetScript, [`${base}:command`, `${base}:work`], ["60000", String(limit), String(limit * 13), "13"]) === 1;
}

/** Request-local actual SDK client. Only fixed private RPCs use elevated admission;
 * auth/state still use the normal session, and every proof stays actor-bound. */
export async function createProfileEditorClient() {
  const session = await createClient();
  const proof = await session.auth.getClaims();
  const parsed = subjectSchema.safeParse(proof.data?.claims?.sub);
  if (proof.error || !parsed.success) throw new Error("Profile editor unavailable");
  const subject = parsed.data;
  const service = createSupabaseServiceClient(async (input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as { input_operation?: unknown } : null;
    if (init?.signal?.aborted || !body || typeof body.input_operation !== "string"
      || !operations.has(body.input_operation)
      || !await admitProfileEditor(subject, body.input_operation === "save_current_owner_profile_text_working")
      || init?.signal?.aborted) return new Response('{"message":"Profile editor unavailable"}', { status: 503, headers: { "Content-Type": "application/json" } });
    return fetch(input, { ...init, cache: "no-store", redirect: "error" });
  });
  return new Proxy(session, { get(target, property) {
    if (property === "auth") return new Proxy(target.auth, { get(auth, member) {
      if (member === "getClaims") return async () => {
        const result = await auth.getClaims();
        return result.data?.claims?.sub === subject ? result : { data: null, error: { message: "Actor changed" } };
      };
      const value = Reflect.get(auth, member); return typeof value === "function" ? value.bind(auth) : value;
    } });
    if (property === "schema") return (schema: string) => new Proxy(target.schema(schema), { get(db, member) {
      if (member !== "rpc") throw new Error("Profile editor operation unavailable");
      return (name: string, args: unknown = {}) => {
        if (schema !== "api") throw new Error("Profile editor schema unavailable");
        if (name === "resolve_current_owner_state") return db.rpc(name);
        if (!operations.has(name)) throw new Error("Profile editor operation unavailable");
        // A real PostgREST builder preserves abortSignal/deadline semantics.
        return service.schema("api").rpc("execute_owner_profile_editor_server", {
          input_subject: subject, input_operation: name, input_payload: args,
        });
      };
    } });
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
}
