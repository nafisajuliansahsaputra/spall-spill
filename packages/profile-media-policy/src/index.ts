export const PROFILE_MEDIA_SOURCE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ProfileMediaSourceContentType =
  (typeof PROFILE_MEDIA_SOURCE_CONTENT_TYPES)[number];

export const PROFILE_MEDIA_MAX_SOURCE_BYTES =
  5 * 1024 * 1024;

export const PROFILE_MEDIA_MAX_SOURCE_DIMENSION =
  4096;

export const PROFILE_MEDIA_MAX_SOURCE_PIXELS =
  4096 * 4096;

export const PROFILE_MEDIA_CANONICAL_CONTENT_TYPE =
  "image/webp" as const;

export const PROFILE_MEDIA_MAX_CANONICAL_DIMENSION =
  2048;

export const PROFILE_MEDIA_MAX_CANONICAL_PIXELS =
  2048 * 2048;

/*
 * Keep canonical media comfortably below Vercel's
 * current 4.5 MB function response boundary.
 *
 * This is also an independent resource-abuse ceiling.
 */
export const PROFILE_MEDIA_MAX_CANONICAL_BYTES =
  3 * 1024 * 1024;

export const PROFILE_MEDIA_CANONICAL_WEBP_QUALITY =
  85;

export const PROFILE_MEDIA_SANITIZER_TIMEOUT_MS =
  10_000;

export const PROFILE_MEDIA_SANITIZER_SIGNATURE_TTL_SECONDS =
  60;

export const PROFILE_MEDIA_SANITIZER_SOURCE_GET_TTL_SECONDS =
  60;