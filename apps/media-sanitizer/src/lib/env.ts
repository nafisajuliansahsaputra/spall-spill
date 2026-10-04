const SHARED_SECRET_ENV =
  "MEDIA_SANITIZER_SHARED_SECRET";

const ALLOWED_SOURCE_ORIGIN_ENV =
  "MEDIA_SANITIZER_ALLOWED_SOURCE_ORIGIN";

export type MediaSanitizerEnv =
  Readonly<{
    sharedSecret: string;
    allowedSourceOrigin: string;
  }>;

function requireEnv(
  value: string | undefined,
  name: string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new Error(
      `Missing required sanitizer environment variable: ${name}`,
    );
  }

  return normalized;
}

function validateSharedSecret(
  value: string,
): string {
  if (value.length < 32) {
    throw new Error(
      `${SHARED_SECRET_ENV} must contain at least 32 characters.`,
    );
  }

  return value;
}

function validateAllowedOrigin(
  value: string,
): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `${ALLOWED_SOURCE_ORIGIN_ENV} must be a valid URL origin.`,
    );
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${ALLOWED_SOURCE_ORIGIN_ENV} must be an exact HTTPS origin.`,
    );
  }

  return url.origin;
}

export function getMediaSanitizerEnv():
  MediaSanitizerEnv {
  return {
    sharedSecret:
      validateSharedSecret(
        requireEnv(
          process.env
            .MEDIA_SANITIZER_SHARED_SECRET,
          SHARED_SECRET_ENV,
        ),
      ),

    allowedSourceOrigin:
      validateAllowedOrigin(
        requireEnv(
          process.env
            .MEDIA_SANITIZER_ALLOWED_SOURCE_ORIGIN,
          ALLOWED_SOURCE_ORIGIN_ENV,
        ),
      ),
  };
}