import { z } from "zod";

export const PROFILE_MEDIA_SOURCE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const profileMediaSourceContentTypeSchema =
  z.enum(PROFILE_MEDIA_SOURCE_CONTENT_TYPES);

export type ProfileMediaSourceContentType =
  z.infer<typeof profileMediaSourceContentTypeSchema>;

export const PROFILE_MEDIA_MAX_SOURCE_BYTES =
  5 * 1024 * 1024;

export const PROFILE_MEDIA_PRESIGNED_PUT_TTL_SECONDS =
  300;

export const PROFILE_MEDIA_PRESIGNED_GET_TTL_SECONDS =
  300;

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

export const PROFILE_MEDIA_CANONICAL_WEBP_QUALITY =
  85;

export const profileMediaDeclaredByteSizeSchema =
  z
    .number()
    .int()
    .min(1)
    .max(PROFILE_MEDIA_MAX_SOURCE_BYTES);

export const profileMediaAssetKeySchema =
  z.string().uuid();