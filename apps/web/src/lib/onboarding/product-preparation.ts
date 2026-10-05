import "server-only";
import { createClient } from "@/lib/supabase/server";
import { productPreparationSuccessSchema } from "./product-preparation-contract";

export async function resolveCurrentProductPreparation() {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string" || !claims.claims.sub) {
    throw new Error("Product preparation requires verified authentication.");
  }
  const { data, error } = await supabase.schema("api").rpc("resolve_current_product_preparation");
  const parsed = productPreparationSuccessSchema.safeParse(data);
  if (error || !parsed.success) throw new Error("Current Product preparation could not be verified.");
  return parsed.data;
}
