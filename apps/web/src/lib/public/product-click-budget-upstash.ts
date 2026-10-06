import "server-only";
import { z } from "zod";
import { productClickBudgetScript, type ProductClickBudgetRedis } from "./product-click-budget";
const configSchema = z.object({ origin: z.string(), namespace: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/),
  token: z.string().min(16).max(4096).regex(/^[A-Za-z0-9._~+/-]+=*$/) }).strict();
const resultSchema = z.object({ result: z.union([z.literal(0), z.literal(1)]) }).strict();
const integer = (s: string, minimum: number, maximum: number) => /^(0|[1-9][0-9]{0,6})$/.test(s)
  && Number(s) >= minimum && Number(s) <= maximum;

/** Private, command-confined adapter. No environment reads, retries or public wiring. */
export function createProductClickUpstashBudgetTransport(config: { origin: string; namespace: string; token: string },
  fetcher: typeof fetch = fetch): ProductClickBudgetRedis {
  return { async eval(script, keys, args) {
    let timer: ReturnType<typeof setTimeout> | undefined; let active = true;
    const controller = new AbortController(); let reader: ReadableStreamDefaultReader<Uint8Array> | undefined; let complete = false;
    try {
      const parsed = configSchema.safeParse(config); if (!parsed.success) return null;
      const c = parsed.data; const origin = new URL(c.origin);
      if (origin.origin !== c.origin || origin.protocol !== "https:" || origin.port || origin.username || origin.password
        || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.upstash\.io$/.test(origin.hostname)) return null;
      if (script !== productClickBudgetScript || keys.length !== 2 || args.length !== 4) return null;
      const match = keys[0]!.match(new RegExp(`^spall-click:${c.namespace}:\\{([a-f0-9]{64})\\}:(issue|redeem)$`));
      if (!match || keys[1] !== `spall-click:${c.namespace}:{${match[1]}}:work`
        || !integer(args[0]!, 1000, 3600000) || !integer(args[1]!, 1, 1000000) || !integer(args[2]!, 1, 1000000)
        || !(match[2] === "redeem" ? args[3] === "3" : ["4", "32"].includes(args[3]!)) || Number(args[2]) < Number(args[3])) return null;
      const started = performance.now(); const timely = () => { const now = performance.now(); return Number.isFinite(now) && now >= started && now < started + 1500; };
      if (!Number.isFinite(started)) return null;
      const url = `${c.origin}/`;
      const run = async () => {
        const response = await fetcher(url, { method: "POST", cache: "no-store", redirect: "error", signal: controller.signal,
          headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" }, body: JSON.stringify(["eval", script, 2, ...keys, ...args]) });
        const length = response.headers.get("content-length");
        if (!active || !timely() || response.status !== 200 || response.redirected || (response.url && response.url !== url)
          || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get("content-type") ?? "")
          || (length !== null && !integer(length, 0, 4096)) || response.body === null) {
          if (response.body) void response.body.cancel().catch(() => {});
          return null;
        }
        reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0; let reads = 0;
        while (true) {
          if (!active || !timely() || ++reads > 4097) return null;
          const part = await reader.read(); if (!active || !timely()) return null;
          if (part.done) { complete = true; break; }
          size += part.value.byteLength; if (size > 4096) return null;
          chunks.push(part.value.slice());
        }
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (!/^[ \t\r\n]*\{[ \t\r\n]*"result"[ \t\r\n]*:[ \t\r\n]*[01][ \t\r\n]*\}[ \t\r\n]*$/.test(text)) return null;
        const result = resultSchema.safeParse(JSON.parse(text));
        return active && timely() && result.success ? result.data.result : null;
      };
      return await Promise.race([run(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1500); })]);
    } catch { return null; }
    finally {
      active = false; clearTimeout(timer); controller.abort();
      if (reader) { if (!complete) void reader.cancel().catch(() => {}); else reader.releaseLock(); }
    }
  } };
}
