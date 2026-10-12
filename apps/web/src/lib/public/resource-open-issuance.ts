import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPublishedResourceOpenIntentCore } from "./resource-open-intent";
import { createResourceOpenIntentRpcAdapter } from "./resource-open-intent-store";
import { readResourceOpenClock } from "./resource-open-clock";
import { createPublishedResourceRpcAdapter } from "./resource-rpc";

/** Unmounted private assembly; no client credentials, grants or public action. */
export function createPublishedResourceOpenIssuance(client: Pick<SupabaseClient, "schema">,
  readClock = () => readResourceOpenClock(client)) {
  const adapter = createResourceOpenIntentRpcAdapter(client);
  const resources = createPublishedResourceRpcAdapter(client);
  function core(clock: NonNullable<Awaited<ReturnType<typeof readClock>>>) {
    return createPublishedResourceOpenIntentCore({ store: adapter.store, now: clock.upperNow, issueNow: clock.lowerNow,
      async resolve(binding) {
        const source = await resources.resolveSource(binding);
        return source === null ? null : { status: "success", source_url: source };
      },
      async resolveConsumed(record) {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            (async () => {
              const { data, error } = await client.schema("api").rpc("resolve_resource_open_intent_source_server", {
                input_record: record,
              }).abortSignal(controller.signal);
              return !controller.signal.aborted && error === null ? data : null;
            })(),
            new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 5000); }),
          ]);
        } catch { return null; }
        finally { clearTimeout(timer); }
      },
    });
  }
  async function recognize(locator: unknown) {
    try {
      const context = await resources.readContext(locator);
      if (context === null || context.status !== "success") return null;
      let token: string | null = null;
      if (context.recognition.available && context.binding !== null) {
        try {
          const clock = await readClock();
          if (clock !== null) token = await core(clock).issue(locator, context);
        } catch { /* Recognition remains valid; failed issuance provides no action. */ }
      }
      return { recognition: context.recognition, token };
    } catch { return null; }
  }
  return {
    recognize,
    async issue(locator: unknown) {
      const result = await recognize(locator);
      return result === null || result.token === null ? null : { recognition: result.recognition, token: result.token };
    },
    async redeem(token: unknown, expectedContext: unknown) {
      try {
        const clock = await readClock();
        return clock === null ? null : await core(clock).redeem(token, expectedContext);
      } catch { return null; }
    },
    cleanup: adapter.cleanup,
  };
}
