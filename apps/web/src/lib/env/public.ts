import { z } from "zod";

const supabasePublicConfigSchema = z.object({
  url: z.string().url(),
  publishableKey: z.string().min(1),
});

export type SupabasePublicConfig = z.infer<typeof supabasePublicConfigSchema>;

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const parsed = supabasePublicConfigSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      "Supabase public configuration is missing or invalid. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return parsed.data;
}
