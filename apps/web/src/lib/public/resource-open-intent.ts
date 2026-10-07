import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { parsePublishedResourceServerContext } from "./resource-server-context";
import { publishedResourceSourceRequestSchema, validatePublishedResourceSourceResult } from "./resource-source";

const ttl = 120_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const timeSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const contextSchema = z.object({ handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
export const resourceOpenIntentRecordSchema = z.object({
  purpose: z.literal("published-resource-open-v1"), binding: publishedResourceSourceRequestSchema,
  recognition_hash: z.string().regex(/^[0-9a-f]{64}$/), issued_at: timeSchema, expires_at: timeSchema,
}).strict().refine(record => record.expires_at === record.issued_at + ttl);
type Binding = z.infer<typeof publishedResourceSourceRequestSchema>;
export type ResourceOpenIntentRecord = z.infer<typeof resourceOpenIntentRecordSchema>;

/** Must be durable/shared and atomically consume once before any production assembly. */
export interface ResourceOpenIntentStore {
  create(tokenHash: string, record: ResourceOpenIntentRecord): Promise<boolean>;
  consume(tokenHash: string): Promise<unknown>;
}

/** Unmounted core; server context provenance, durable storage and calibrated assembly remain required. */
export function createPublishedResourceOpenIntentCore({ store, resolve, now = Date.now, issueNow = now, resolveConsumed }: {
  store: ResourceOpenIntentStore;
  resolve: (binding: Binding) => Promise<unknown>;
  now?: () => number;
  issueNow?: () => number;
  resolveConsumed?: (record: ResourceOpenIntentRecord) => Promise<unknown>;
}) {
  return {
    async issue(locator: unknown, serverContext: unknown): Promise<string | null> {
      try {
        const context = parsePublishedResourceServerContext(locator, serverContext);
        if (context === null || !context.recognition.available || context.binding === null) return null;
        const binding = context.binding;
        if (validatePublishedResourceSourceResult(binding, await resolve({ ...binding })) === null) return null;
        const issuedAt = issueNow();
        const record = resourceOpenIntentRecordSchema.safeParse({ purpose: "published-resource-open-v1", binding,
          recognition_hash: hash(JSON.stringify(context.recognition)), issued_at: issuedAt, expires_at: issuedAt + ttl });
        if (!record.success) return null;
        const token = randomBytes(32).toString("base64url");
        if (await store.create(hash(token), record.data) !== true) return null;
        const returnedAt = now();
        return timeSchema.safeParse(returnedAt).success && returnedAt >= issuedAt && returnedAt < record.data.expires_at ? token : null;
      } catch { return null; }
    },
    async redeem(token: unknown, expectedContext: unknown): Promise<string | null> {
      try {
        const context = contextSchema.safeParse(expectedContext);
        if (!context.success || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)
          || Buffer.from(token, "base64url").toString("base64url") !== token) return null;
        // Consume first; no later failure may restore the one-use capability.
        const record = resourceOpenIntentRecordSchema.safeParse(await store.consume(hash(token)));
        if (!record.success) return null;
        const binding = record.data.binding;
        const checkedAt = now();
        if (!timeSchema.safeParse(checkedAt).success || checkedAt < record.data.issued_at || checkedAt >= record.data.expires_at
          || binding.handle !== context.data.handle || binding.spill_reference !== context.data.spill_reference) return null;
        const result = resolveConsumed ? await resolveConsumed(record.data) : await resolve({ ...binding });
        const decidedAt = now();
        if (!timeSchema.safeParse(decidedAt).success || decidedAt < checkedAt || decidedAt >= record.data.expires_at) return null;
        return validatePublishedResourceSourceResult(binding, result);
      } catch { return null; }
    },
  };
}
