import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";

const SUPABASE_SECRET_KEY_ENV = "SUPABASE_SECRET_KEY";
const SUPABASE_SERVICE_ROLE_KEY_ENV =
  "SUPABASE_SERVICE_ROLE_KEY";

type SupabaseElevatedCredential = Readonly<{
  key: string;
  source:
    | typeof SUPABASE_SECRET_KEY_ENV
    | typeof SUPABASE_SERVICE_ROLE_KEY_ENV;
}>;

function readOptionalSecret(
  value: string | undefined,
): string | null {
  const normalizedValue = value?.trim();

  return normalizedValue
    ? normalizedValue
    : null;
}

function getSupabaseElevatedCredential(): SupabaseElevatedCredential {
  const secretKey = readOptionalSecret(
    process.env.SUPABASE_SECRET_KEY,
  );

  if (secretKey) {
    if (!secretKey.startsWith("sb_secret_")) {
      throw new Error(
        `${SUPABASE_SECRET_KEY_ENV} must use the current sb_secret_ key format`,
      );
    }

    return {
      key: secretKey,
      source: SUPABASE_SECRET_KEY_ENV,
    };
  }

  const legacyServiceRoleKey = readOptionalSecret(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (legacyServiceRoleKey) {
    return {
      key: legacyServiceRoleKey,
      source: SUPABASE_SERVICE_ROLE_KEY_ENV,
    };
  }

  throw new Error(
    `Missing required server credential: provide ${SUPABASE_SECRET_KEY_ENV}, or ${SUPABASE_SERVICE_ROLE_KEY_ENV} for local Supabase development`,
  );
}

export function createSupabaseServiceClient() {
  const { supabaseUrl } =
    getSupabasePublicEnv();

  const { key } =
    getSupabaseElevatedCredential();

  return createSupabaseClient(
    supabaseUrl,
    key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}