import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export const recoveryTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,512}$/);
export const recoveryEmailSchema = z.string().trim().max(254).email();
export const recoveryPasswordSchema = z.string().min(8).max(1024);

/** Ephemeral authority only: recovery never reads or replaces the current browser session. */
export function createRecoveryClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicEnv();
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function requestRecovery(client: Pick<SupabaseClient, "auth">, email: string): Promise<void> {
  // Intentionally uniform for unknown email, rate limits and provider failures.
  // Site URL and the fixed recovery email template are provider configuration.
  try { await client.auth.resetPasswordForEmail(email); } catch { /* no account enumeration */ }
}
export async function restoreRecovery(client: Pick<SupabaseClient, "auth">, token: string, password: string): Promise<boolean> {
  if (!recoveryTokenSchema.safeParse(token).success || !recoveryPasswordSchema.safeParse(password).success) return false;
  try {
    const verified = await client.auth.verifyOtp({ type: "recovery", token_hash: token });
    const user = verified.data.user;
    if (verified.error || !user || !verified.data.session || verified.data.session.user.id !== user.id) return false;
    const updated = await client.auth.updateUser({ password });
    return updated.error === null && updated.data.user?.id === user.id;
  } catch { return false; }
  finally {
    try { await client.auth.signOut({ scope: "local" }); } catch { /* ephemeral client is discarded */ }
  }
}
