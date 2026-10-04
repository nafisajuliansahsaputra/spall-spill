import {
  PROFILE_MEDIA_MAX_SOURCE_BYTES,
  PROFILE_MEDIA_SOURCE_CONTENT_TYPES,
  type ProfileMediaSourceContentType,
} from "@spall-spill/profile-media-policy";

export class MediaSanitizerSourceError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "MediaSanitizerSourceError";
  }
}

export function parseExpectedContentType(
  value: unknown,
):
  | ProfileMediaSourceContentType
  | null {
  if (
    typeof value !== "string" ||
    !PROFILE_MEDIA_SOURCE_CONTENT_TYPES.includes(
      value as ProfileMediaSourceContentType,
    )
  ) {
    return null;
  }

  return value as
    ProfileMediaSourceContentType;
}

export function parseExpectedByteSize(
  value: unknown,
): number | null {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(
      value,
    ) ||
    value < 1 ||
    value >
      PROFILE_MEDIA_MAX_SOURCE_BYTES
  ) {
    return null;
  }

  return value;
}

export function validateStagingSourceUrl(
  input: Readonly<{
    sourceUrl: unknown;
    allowedOrigin: string;
  }>,
): URL {
  if (
    typeof input.sourceUrl !==
      "string"
  ) {
    throw new MediaSanitizerSourceError(
      "Invalid staging source URL.",
    );
  }

  let url: URL;

  try {
    url =
      new URL(
        input.sourceUrl,
      );
  } catch {
    throw new MediaSanitizerSourceError(
      "Invalid staging source URL.",
    );
  }

  if (
    url.protocol !== "https:" ||
    url.origin !==
      input.allowedOrigin ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new MediaSanitizerSourceError(
      "Staging source URL is outside the allowed origin.",
    );
  }

  return url;
}

function normalizeContentType(
  value: string | null,
): string | null {
  const normalized =
    value
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();

  return normalized
    ? normalized
    : null;
}

export async function loadUntrustedSource(
  input: Readonly<{
    sourceUrl: string;
    allowedOrigin: string;
    expectedContentType:
      ProfileMediaSourceContentType;
    expectedByteSize: number;
  }>,
): Promise<Buffer> {
  const url =
    validateStagingSourceUrl({
      sourceUrl:
        input.sourceUrl,
      allowedOrigin:
        input.allowedOrigin,
    });

  let response: Response;

  try {
    response =
      await fetch(
        url,
        {
          method: "GET",

          /*
           * Redirects are never followed.
           * The sanitizer must never be turned into
           * a generic SSRF fetcher.
           */
          redirect: "manual",

          signal:
            AbortSignal.timeout(
              5_000,
            ),
        },
      );
  } catch {
    throw new MediaSanitizerSourceError(
      "Staging source could not be fetched.",
    );
  }

  if (
    response.status < 200 ||
    response.status >= 300
  ) {
    throw new MediaSanitizerSourceError(
      "Staging source returned an unacceptable response.",
    );
  }

  const contentType =
    normalizeContentType(
      response.headers.get(
        "content-type",
      ),
    );

  if (
    contentType !==
      input.expectedContentType
  ) {
    throw new MediaSanitizerSourceError(
      "Staging source Content-Type does not match the authoritative intent.",
    );
  }

  const contentLengthValue =
    response.headers.get(
      "content-length",
    );

  if (
    !contentLengthValue ||
    !/^\d+$/.test(
      contentLengthValue,
    )
  ) {
    throw new MediaSanitizerSourceError(
      "Staging source has no trustworthy Content-Length.",
    );
  }

  const contentLength =
    Number(
      contentLengthValue,
    );

  if (
    !Number.isSafeInteger(
      contentLength,
    ) ||
    contentLength < 1 ||
    contentLength >
      PROFILE_MEDIA_MAX_SOURCE_BYTES ||
    contentLength !==
      input.expectedByteSize
  ) {
    throw new MediaSanitizerSourceError(
      "Staging source byte size does not match the authoritative intent.",
    );
  }

  let bytes: Buffer;

  try {
    bytes =
      Buffer.from(
        await response.arrayBuffer(),
      );
  } catch {
    throw new MediaSanitizerSourceError(
      "Staging source body could not be read.",
    );
  }

  if (
    bytes.byteLength !==
      contentLength ||
    bytes.byteLength !==
      input.expectedByteSize
  ) {
    throw new MediaSanitizerSourceError(
      "Staging source changed while being read.",
    );
  }

  return bytes;
}