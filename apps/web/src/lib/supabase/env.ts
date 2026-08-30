const SUPABASE_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY_ENV =
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

export type SupabasePublicEnv = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

function requirePublicEnv(
  value: string | undefined,
  variableName: string,
): string {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`Missing required environment variable: ${variableName}`);
  }

  return normalizedValue;
}

function validateSupabaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${SUPABASE_URL_ENV} must be a valid URL`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `${SUPABASE_URL_ENV} must use the http or https protocol`,
    );
  }

  return value;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const supabaseUrl = validateSupabaseUrl(
    requirePublicEnv(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_URL_ENV,
    ),
  );

  const supabasePublishableKey = requirePublicEnv(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_PUBLISHABLE_KEY_ENV,
  );

  return {
    supabaseUrl,
    supabasePublishableKey,
  };
}