import { z } from "zod";
import { publicProductSchema } from "./product-contract";
import { publicResourceSchema } from "./resource-contract";

export const publicSpillItemPayloadSchema = z.union([
  z.object({ status: z.literal("success"), item_type: z.literal("product"), detail: publicProductSchema }).strict(),
  z.object({ status: z.literal("success"), item_type: z.literal("resource"), detail: publicResourceSchema }).strict(),
  z.object({ status: z.literal("unavailable") }).strict(),
]);
export type PublicSpillItemPayload = z.infer<typeof publicSpillItemPayloadSchema>;
