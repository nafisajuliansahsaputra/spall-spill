import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } =
    getSupabasePublicEnv();

  return createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({ name, value, options }) => {
                cookieStore.set(name, value, options);
              },
            );
          } catch {
            /*
             * Server Components cannot write cookies.
             * The Next.js Proxy is responsible for normal
             * authentication-session refresh.
             */
          }
        },
      },
    },
  );
}

/** Logout may clear SDK storage even on provider failure. Apply cookie writes only
 * after the caller observes a successful provider acknowledgment. Request-local;
 * this context must never be shared or used as an ordinary mutation client. */
export async function createSessionExitContext() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicEnv();
  const pending = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const client = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(changes) {
        for (const change of changes) pending.set(change.name, change);
      },
    },
  });
  return {
    client,
    commitCookieChanges() {
      for (const { name, value, options } of pending.values()) cookieStore.set(name, value, options);
      pending.clear();
    },
  };
}
