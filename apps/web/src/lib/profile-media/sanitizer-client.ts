import "server-only";

import {
  createHmac,
} from "node:crypto";

import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  PROFILE_MEDIA_MAX_CANONICAL_BYTES,
  PROFILE_MEDIA_MAX_CANONICAL_DIMENSION,
  PROFILE_MEDIA_MAX_CANONICAL_PIXELS,
  PROFILE_MEDIA_SANITIZER_TIMEOUT_MS,
  type ProfileMediaSourceContentType,
} from "@spall-spill/profile-media-policy";

const SANITIZER_URL_ENV =
  "MEDIA_SANITIZER_URL";

const SANITIZER_SECRET_ENV =
  "MEDIA_SANITIZER_SHARED_SECRET";

export type SanitizedProfileMedia =
  Readonly<{
    bytes: Buffer;
    contentType:
      typeof PROFILE_MEDIA_CANONICAL_CONTENT_TYPE;
    byteSize: number;
    width: number;
    height: number;
  }>;

export class ProfileMediaSanitizerError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "ProfileMediaSanitizerError";
  }
}

function requireEnv(
  value: string | undefined,
  name: string,
): string {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new ProfileMediaSanitizerError(
      `Missing required media sanitizer configuration: ${name}.`,
    );
  }

  return normalized;
}

function resolveSanitizerOrigin():
  string {
  const value =
    requireEnv(
      process.env
        .MEDIA_SANITIZER_URL,
      SANITIZER_URL_ENV,
    );

  let url: URL;

  try {
    url =
      new URL(value);
  } catch {
    throw new ProfileMediaSanitizerError(
      "MEDIA_SANITIZER_URL is invalid.",
    );
  }

  const development =
    process.env.NODE_ENV !==
      "production";

  const localHttp =
    development &&
    url.protocol === "http:" &&
    (
      url.hostname ===
        "127.0.0.1" ||
      url.hostname ===
        "localhost"
    );

  if (
    url.protocol !== "https:" &&
    !localHttp
  ) {
    throw new ProfileMediaSanitizerError(
      "MEDIA_SANITIZER_URL must use HTTPS outside local development.",
    );
  }

  if (
    url.username ||
    url.password ||
    (
      url.pathname !== "/" &&
      url.pathname !== ""
    ) ||
    url.search ||
    url.hash
  ) {
    throw new ProfileMediaSanitizerError(
      "MEDIA_SANITIZER_URL must be an exact origin.",
    );
  }

  return url.origin;
}

function resolveSharedSecret():
  string {
  const secret =
    requireEnv(
      process.env
        .MEDIA_SANITIZER_SHARED_SECRET,
      SANITIZER_SECRET_ENV,
    );

  if (secret.length < 32) {
    throw new ProfileMediaSanitizerError(
      "MEDIA_SANITIZER_SHARED_SECRET is too short.",
    );
  }

  return secret;
}

function createSignature(
  input: Readonly<{
    secret: string;
    timestamp: string;
    body: string;
  }>,
): string {
  return createHmac(
    "sha256",
    input.secret,
  )
    .update(
      `${input.timestamp}\n${input.body}`,
      "utf8",
    )
    .digest("hex");
}

function parsePositiveIntegerHeader(
  response: Response,
  name: string,
): number {
  const value =
    response.headers.get(name);

  if (
    !value ||
    !/^\d+$/.test(value)
  ) {
    throw new ProfileMediaSanitizerError(
      `Sanitizer returned invalid ${name}.`,
    );
  }

  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed < 1
  ) {
    throw new ProfileMediaSanitizerError(
      `Sanitizer returned invalid ${name}.`,
    );
  }

  return parsed;
}

function assertCanonicalWebp(
  bytes: Buffer,
): void {
  if (
    bytes.byteLength < 12 ||
    bytes
      .subarray(0, 4)
      .toString("ascii") !==
      "RIFF" ||
    bytes
      .subarray(8, 12)
      .toString("ascii") !==
      "WEBP" ||
    bytes.readUInt32LE(4) +
      8 !==
      bytes.byteLength
  ) {
    throw new ProfileMediaSanitizerError(
      "Sanitizer returned an invalid canonical WebP container.",
    );
  }
}

export async function sanitizeProfileMediaStagingObject(
  input: Readonly<{
    sourceUrl: string;
    expectedContentType:
      ProfileMediaSourceContentType;
    expectedByteSize: number;
  }>,
): Promise<SanitizedProfileMedia> {
  const origin =
    resolveSanitizerOrigin();

  const secret =
    resolveSharedSecret();

  const body =
    JSON.stringify({
      sourceUrl:
        input.sourceUrl,
      expectedContentType:
        input.expectedContentType,
      expectedByteSize:
        input.expectedByteSize,
    });

  const timestamp =
    String(Date.now());

  const signature =
    createSignature({
      secret,
      timestamp,
      body,
    });

  let response: Response;

  try {
    response =
      await fetch(
        `${origin}/api/sanitize`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-Spall-Timestamp":
              timestamp,

            "X-Spall-Signature":
              signature,
          },

          body,

          redirect: "error",

          signal:
            AbortSignal.timeout(
              PROFILE_MEDIA_SANITIZER_TIMEOUT_MS,
            ),

          cache: "no-store",
        },
      );
  } catch {
    throw new ProfileMediaSanitizerError(
      "Isolated media sanitizer request failed.",
    );
  }

  if (response.status !== 200) {
    throw new ProfileMediaSanitizerError(
      "Isolated media sanitizer rejected the source.",
    );
  }

  const contentType =
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();

  if (
    contentType !==
      PROFILE_MEDIA_CANONICAL_CONTENT_TYPE
  ) {
    throw new ProfileMediaSanitizerError(
      "Sanitizer returned an unexpected Content-Type.",
    );
  }

  const contentLength =
    parsePositiveIntegerHeader(
      response,
      "content-length",
    );

  if (
    contentLength >
      PROFILE_MEDIA_MAX_CANONICAL_BYTES
  ) {
    throw new ProfileMediaSanitizerError(
      "Sanitizer response exceeds the canonical byte ceiling.",
    );
  }

  const width =
    parsePositiveIntegerHeader(
      response,
      "x-spall-media-width",
    );

  const height =
    parsePositiveIntegerHeader(
      response,
      "x-spall-media-height",
    );

  if (
    width >
      PROFILE_MEDIA_MAX_CANONICAL_DIMENSION ||
    height >
      PROFILE_MEDIA_MAX_CANONICAL_DIMENSION ||
    width * height >
      PROFILE_MEDIA_MAX_CANONICAL_PIXELS
  ) {
    throw new ProfileMediaSanitizerError(
      "Sanitizer returned invalid canonical dimensions.",
    );
  }

  let bytes: Buffer;

  try {
    bytes =
      Buffer.from(
        await response.arrayBuffer(),
      );
  } catch {
    throw new ProfileMediaSanitizerError(
      "Sanitizer response body could not be read.",
    );
  }

  if (
    bytes.byteLength !==
      contentLength
  ) {
    throw new ProfileMediaSanitizerError(
      "Sanitizer response length does not match its metadata.",
    );
  }

  assertCanonicalWebp(
    bytes,
  );

  return {
    bytes,
    contentType:
      PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
    byteSize:
      bytes.byteLength,
    width,
    height,
  };
}