import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { providerKeySchema, publicProductSchema } from "./product-contract";
import { publishedProductDestinationRequestSchema, validatePublishedProductDestinationResult } from "./product-destination";

const ttl = 120_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const timeSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const contextSchema = z.object({
  handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  provider_key: providerKeySchema,
}).strict();
export const productClickIntentRecordSchema = z.object({
  purpose: z.literal("published-product-click-v1"),
  binding: publishedProductDestinationRequestSchema,
  confirmation_hash: z.string().regex(/^[0-9a-f]{64}$/),
  issued_at: timeSchema,
  expires_at: timeSchema,
}).strict().refine((record) => record.expires_at === record.issued_at + ttl);
type Binding = z.infer<typeof publishedProductDestinationRequestSchema>;
export type ProductClickIntentRecord = z.infer<typeof productClickIntentRecordSchema>;

/** Requires durable, shared atomic storage before any route can use this staged core. */
export interface ProductClickIntentStore {
  create(tokenHash: string, record: ProductClickIntentRecord): Promise<boolean>;
  consume(tokenHash: string): Promise<unknown>;
}

/** No concrete persistence, public endpoint, redirect or browser issuance authority. */
export function createPublishedProductClickIntentCore({ store, resolve, now = Date.now }: {
  store: ProductClickIntentStore;
  resolve: (binding: Binding) => Promise<unknown>;
  now?: () => number;
}) {
  return {
    async issue(confirmation: unknown, request: unknown): Promise<string | null> {
      try {
        const product = publicProductSchema.safeParse(confirmation);
        const binding = publishedProductDestinationRequestSchema.safeParse(request);
        if (!product.success || !binding.success
          || product.data.current_handle !== binding.data.handle
          || product.data.spill_reference !== binding.data.spill_reference) return null;
        const destination = product.data.destinations.find((entry) => entry.provider_key === binding.data.provider_key);
        if (!destination?.available || destination.destination_url === null
          || hash(destination.destination_url) !== binding.data.destination_hash) return null;
        const result = await resolve({ ...binding.data });
        if (validatePublishedProductDestinationResult(binding.data, result) === null) return null;
        const issuedAt = now();
        const record = productClickIntentRecordSchema.safeParse({
          purpose: "published-product-click-v1", binding: binding.data,
          confirmation_hash: hash(JSON.stringify(product.data)),
          issued_at: issuedAt, expires_at: issuedAt + ttl,
        });
        if (!record.success) return null;
        const token = randomBytes(32).toString("base64url");
        if (await store.create(hash(token), record.data) !== true) return null;
        const returnedAt = now();
        return timeSchema.safeParse(returnedAt).success && returnedAt >= issuedAt
          && returnedAt < record.data.expires_at ? token : null;
      } catch {
        return null;
      }
    },
    async redeem(token: unknown, expectedContext: unknown): Promise<string | null> {
      try {
        const context = contextSchema.safeParse(expectedContext);
        if (!context.success || typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)
          || Buffer.from(token, "base64url").toString("base64url") !== token) return null;
        // Consume before any await of the destination resolver; failures never restore authority.
        const record = productClickIntentRecordSchema.safeParse(await store.consume(hash(token)));
        if (!record.success) return null;
        const binding = record.data.binding;
        const checkedAt = now();
        if (!timeSchema.safeParse(checkedAt).success || checkedAt < record.data.issued_at
          || checkedAt >= record.data.expires_at
          || binding.handle !== context.data.handle || binding.spill_reference !== context.data.spill_reference
          || binding.provider_key !== context.data.provider_key) return null;
        const result = await resolve({ ...binding });
        const decidedAt = now();
        if (!timeSchema.safeParse(decidedAt).success || decidedAt < checkedAt
          || decidedAt >= record.data.expires_at) return null;
        return validatePublishedProductDestinationResult(binding, result);
      } catch {
        return null;
      }
    },
  };
}
