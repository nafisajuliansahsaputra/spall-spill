type ContentSecurityPolicyInput = Readonly<{
  nonce: string;
  isDevelopment: boolean;
  supabaseUrl?: string | undefined;
  r2Endpoint?: string | undefined;
  r2Bucket?: string | undefined;
}>;

function resolveAllowedOrigin(
  value: string | undefined,
  options: Readonly<{
    allowHttp: boolean;
    variableName: string;
  }>,
): string | null {
  const normalized =
    value?.trim();

  if (!normalized) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(normalized);
  } catch {
    throw new Error(
      `${options.variableName} must be a valid URL for CSP configuration.`,
    );
  }

  if (
    url.protocol !== "https:" &&
    !(
      options.allowHttp &&
      url.protocol === "http:"
    )
  ) {
    throw new Error(
      `${options.variableName} uses a protocol that is not allowed by CSP configuration.`,
    );
  }

  return url.origin;
}

function toSocketOrigin(
  origin: string,
): string {
  const url =
    new URL(origin);

  url.protocol =
    url.protocol === "https:"
      ? "wss:"
      : "ws:";

  return url.origin;
}

function resolveR2BucketOrigin(
  endpointOrigin: string | null,
  bucketValue: string | undefined,
): string | null {
  if (!endpointOrigin) {
    return null;
  }

  const bucket =
    bucketValue?.trim();

  if (!bucket) {
    return null;
  }

  /*
   * Keep the browser allowlist exact.
   * Never allow arbitrary bucket names to mutate
   * the CSP host expression.
   */
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(
      bucket,
    )
  ) {
    throw new Error(
      "R2_PROFILE_BUCKET is not safe for CSP host construction.",
    );
  }

  const endpoint =
    new URL(endpointOrigin);

  const bucketOrigin =
    new URL(endpoint.origin);

  bucketOrigin.hostname =
    `${bucket}.${endpoint.hostname}`;

  return bucketOrigin.origin;
}

export function createRequestNonce(): string {
  const bytes =
    new Uint8Array(18);

  crypto.getRandomValues(bytes);

  let binary = "";

  for (const byte of bytes) {
    binary +=
      String.fromCharCode(byte);
  }

  return btoa(binary);
}

export function createContentSecurityPolicy(
  input: ContentSecurityPolicyInput,
): string {
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      input.nonce,
    )
  ) {
    throw new Error(
      "CSP nonce must be a Base64 value.",
    );
  }

  const supabaseOrigin =
    resolveAllowedOrigin(
      input.supabaseUrl,
      {
        allowHttp:
          input.isDevelopment,
        variableName:
          "NEXT_PUBLIC_SUPABASE_URL",
      },
    );

  const r2EndpointOrigin =
    resolveAllowedOrigin(
      input.r2Endpoint,
      {
        allowHttp: false,
        variableName:
          "R2_S3_ENDPOINT",
      },
    );

  const r2BucketOrigin =
    resolveR2BucketOrigin(
      r2EndpointOrigin,
      input.r2Bucket,
    );

  const scriptSources = [
    `'nonce-${input.nonce}'`,
    "'strict-dynamic'",
    "'self'",
  ];

  if (input.isDevelopment) {
    scriptSources.push(
      "'unsafe-eval'",
    );
  }

  const connectSources = [
    "'self'",
  ];

  if (supabaseOrigin) {
    connectSources.push(
      supabaseOrigin,
      toSocketOrigin(
        supabaseOrigin,
      ),
    );
  }

  if (r2EndpointOrigin) {
    connectSources.push(
      r2EndpointOrigin,
    );
  }

  if (r2BucketOrigin) {
    connectSources.push(
      r2BucketOrigin,
    );
  }

  if (input.isDevelopment) {
    connectSources.push(
      "ws:",
    );
  }

  const imageSources = [
    "'self'",
    "blob:",
    "data:",
  ];

  if (r2EndpointOrigin) {
    imageSources.push(
      r2EndpointOrigin,
    );
  }

  if (r2BucketOrigin) {
    imageSources.push(
      r2BucketOrigin,
    );
  }

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!input.isDevelopment) {
    directives.push(
      "upgrade-insecure-requests",
    );
  }

  return directives.join("; ");
}