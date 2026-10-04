const SHARED_SECRET_ENV =
  "URL_SAFETY_SCANNER_SHARED_SECRET";

const WEB_RISK_API_KEY_ENV =
  "GOOGLE_WEB_RISK_API_KEY";

const GEMINI_API_KEY_ENV =
  "GEMINI_API_KEY";

export type UrlSafetyScannerEnv =
  Readonly<{
    sharedSecret: string;
    webRiskApiKey: string;
    geminiApiKey: string;
  }>;

function requireEnv(
  value: string | undefined,
  name: string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new Error(
      `Missing required URL Safety Scanner environment variable: ${name}`,
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

function validateProviderApiKey(
  value: string,
  name: string,
): string {
  if (
    value.length < 16 ||
    /[\u0000-\u0020\u007f]/.test(
      value,
    )
  ) {
    throw new Error(
      `${name} is invalid.`,
    );
  }

  return value;
}

export function getUrlSafetyScannerEnv():
  UrlSafetyScannerEnv {
  return {
    sharedSecret:
      validateSharedSecret(
        requireEnv(
          process.env
            .URL_SAFETY_SCANNER_SHARED_SECRET,
          SHARED_SECRET_ENV,
        ),
      ),

    webRiskApiKey:
      validateProviderApiKey(
        requireEnv(
          process.env
            .GOOGLE_WEB_RISK_API_KEY,
          WEB_RISK_API_KEY_ENV,
        ),
        WEB_RISK_API_KEY_ENV,
      ),

    geminiApiKey:
      validateProviderApiKey(
        requireEnv(
          process.env
            .GEMINI_API_KEY,
          GEMINI_API_KEY_ENV,
        ),
        GEMINI_API_KEY_ENV,
      ),
  };
}