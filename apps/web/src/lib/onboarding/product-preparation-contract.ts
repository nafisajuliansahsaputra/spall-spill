import { z } from "zod";

export const productRevisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const productImageKeySchema = z.string().uuid().regex(/^[0-9a-f-]+$/);

// Host context only. A recognized provider never implies a current safe verdict.
export function marketplaceProvider(url: string): string | null {
  if (url.length > 2048 || !/^https?:\/\//.test(url) || /[\s\\#]/u.test(url)) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.hash || parsed.port || host.length > 253 || !host.includes(".")
      || /^[0-9.]+$/.test(host) || /(^|\.)(localhost|local|internal)$/.test(host)
      || host === "home.arpa" || host.endsWith(".home.arpa")
      || host.split(".").some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
    const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
    if (matches("shopee.co.id") || matches("shope.ee")) return "shopee";
    if (matches("tokopedia.com") || matches("tokopedia.link")) return "tokopedia";
    if (matches("tiktok.com")) return "tiktok";
    return `external:${host}`;
  } catch { return null; }
}

export const productDestinationSchema = z.object({
  provider_key: z.string().min(1).max(262),
  destination_url: z.string().min(8).max(2048),
}).strict().refine((destination) => marketplaceProvider(destination.destination_url) === destination.provider_key);
export const productDestinationsSchema = z.array(productDestinationSchema).max(10).refine((destinations) =>
  new Set(destinations.map((destination) => destination.provider_key)).size === destinations.length
  && new Set(destinations.map((destination) => destination.destination_url)).size === destinations.length);
export const productPreparationSchema = z.object({
  primary_asset_key: productImageKeySchema.nullable(),
  destinations: productDestinationsSchema,
  revision: productRevisionSchema,
}).strict();
export const productPreparationSuccessSchema = z.object({
  status: z.literal("success"), current_step: z.enum(["relevant_first_job", "preview_publish"]),
  product_revision: productRevisionSchema.nullable(), preparation: productPreparationSchema.nullable(),
}).strict().refine((result) => result.preparation === null || result.product_revision !== null);
export type ProductPreparation = z.infer<typeof productPreparationSchema>;
export type ProductPreparationActionState = {
  status: "idle" | "error"; message: string | null; destinations: string; primaryAssetKey: string;
};
