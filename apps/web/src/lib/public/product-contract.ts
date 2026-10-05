import { z } from "zod";
import { marketplaceProvider, productDestinationSchema } from "@/lib/onboarding/product-preparation-contract";
import { publicHandleSchema } from "./locators";

const providerKeySchema = z.string().min(1).max(262).refine((key) =>
  ["shopee", "tokopedia", "tiktok"].includes(key)
  || (key.startsWith("external:") && marketplaceProvider(`https://${key.slice(9)}/`) === key));
const destinationSchema = z.object({
  provider_key: providerKeySchema,
  available: z.boolean(),
  destination_url: z.string().min(8).max(2048).nullable(),
}).strict().refine((destination) => destination.available
  ? destination.destination_url !== null && productDestinationSchema.safeParse({
    provider_key: destination.provider_key, destination_url: destination.destination_url,
  }).success : destination.destination_url === null);

export const publicProductSchema = z.object({
  status: z.literal("success"), current_handle: publicHandleSchema,
  display_name: z.string().min(1).max(80).refine((name) => name.trim().length > 0),
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  title: z.string().min(1).max(160).refine((title) => title.trim().length > 0),
  primary_image_path: z.string(),
  destinations: z.array(destinationSchema).min(1).max(10).refine((destinations) => {
    const urls = destinations.flatMap((destination) => destination.destination_url === null ? [] : [destination.destination_url]);
    return new Set(destinations.map((destination) => destination.provider_key)).size === destinations.length
      && new Set(urls).size === urls.length;
  }),
}).strict().refine((product) => product.primary_image_path === `/media/product/${product.current_handle}/${product.spill_reference}`);
export const publicProductPayloadSchema = z.union([
  publicProductSchema, z.object({ status: z.literal("unavailable") }).strict(),
]);
export type PublicProduct = z.infer<typeof publicProductSchema>;
