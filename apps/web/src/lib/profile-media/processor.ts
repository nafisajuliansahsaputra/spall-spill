import "server-only";

import sharp from "sharp";

import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  PROFILE_MEDIA_CANONICAL_WEBP_QUALITY,
  PROFILE_MEDIA_MAX_CANONICAL_DIMENSION,
  PROFILE_MEDIA_MAX_CANONICAL_PIXELS,
  PROFILE_MEDIA_MAX_SOURCE_BYTES,
  PROFILE_MEDIA_MAX_SOURCE_DIMENSION,
  PROFILE_MEDIA_MAX_SOURCE_PIXELS,
  type ProfileMediaSourceContentType,
} from "@/lib/profile-media/contracts";

const SOURCE_FORMAT_CONTENT_TYPES =
  {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  } as const;

type SupportedSharpSourceFormat =
  keyof typeof SOURCE_FORMAT_CONTENT_TYPES;

export type ProcessedProfileMedia =
  Readonly<{
    bytes: Buffer;
    contentType:
      typeof PROFILE_MEDIA_CANONICAL_CONTENT_TYPE;
    byteSize: number;
    width: number;
    height: number;
  }>;

export class ProfileMediaProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ProfileMediaProcessingError";
  }
}

function resolveDecodedContentType(
  format: string | undefined,
): ProfileMediaSourceContentType {
  if (
    !format ||
    !Object.prototype.hasOwnProperty.call(
      SOURCE_FORMAT_CONTENT_TYPES,
      format,
    )
  ) {
    throw new ProfileMediaProcessingError(
      "Profile Media source format is unsupported.",
    );
  }

  return SOURCE_FORMAT_CONTENT_TYPES[
    format as SupportedSharpSourceFormat
  ];
}

export async function processProfileMediaSource(
  input: Readonly<{
    bytes: Buffer;
    expectedContentType:
      ProfileMediaSourceContentType;
  }>,
): Promise<ProcessedProfileMedia> {
  if (
    input.bytes.byteLength < 1 ||
    input.bytes.byteLength >
      PROFILE_MEDIA_MAX_SOURCE_BYTES
  ) {
    throw new ProfileMediaProcessingError(
      "Profile Media source byte size is invalid.",
    );
  }

  let metadata;

  try {
    metadata =
      await sharp(
        input.bytes,
        {
          animated: true,
          failOn: "warning",
          limitInputPixels:
            PROFILE_MEDIA_MAX_SOURCE_PIXELS,
        },
      ).metadata();
  } catch {
    throw new ProfileMediaProcessingError(
      "Profile Media source could not be decoded.",
    );
  }

  const decodedContentType =
    resolveDecodedContentType(
      metadata.format,
    );

  if (
    decodedContentType !==
    input.expectedContentType
  ) {
    throw new ProfileMediaProcessingError(
      "Profile Media decoded format does not match its declared Content-Type.",
    );
  }

  const width =
    metadata.width;

  const height =
    metadata.height;

  if (
    !width ||
    !height ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width >
      PROFILE_MEDIA_MAX_SOURCE_DIMENSION ||
    height >
      PROFILE_MEDIA_MAX_SOURCE_DIMENSION ||
    width * height >
      PROFILE_MEDIA_MAX_SOURCE_PIXELS
  ) {
    throw new ProfileMediaProcessingError(
      "Profile Media source dimensions exceed the supported boundary.",
    );
  }

  const pageCount =
    metadata.pages ?? 1;

  if (
    !Number.isSafeInteger(
      pageCount,
    ) ||
    pageCount !== 1
  ) {
    throw new ProfileMediaProcessingError(
      "Animated or multi-page Profile Media is not supported.",
    );
  }

  let output;

  try {
    output =
      await sharp(
        input.bytes,
        {
          animated: false,
          failOn: "warning",
          limitInputPixels:
            PROFILE_MEDIA_MAX_SOURCE_PIXELS,
        },
      )
        .autoOrient()
        .resize({
          width:
            PROFILE_MEDIA_MAX_CANONICAL_DIMENSION,
          height:
            PROFILE_MEDIA_MAX_CANONICAL_DIMENSION,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality:
            PROFILE_MEDIA_CANONICAL_WEBP_QUALITY,
        })
        .toBuffer({
          resolveWithObject: true,
        });
  } catch {
    throw new ProfileMediaProcessingError(
      "Profile Media source could not be safely canonicalized.",
    );
  }

  if (
    output.info.format !==
    "webp"
  ) {
    throw new ProfileMediaProcessingError(
      "Canonical Profile Media output format is invalid.",
    );
  }

  if (
    output.info.width < 1 ||
    output.info.height < 1 ||
    output.info.width >
      PROFILE_MEDIA_MAX_CANONICAL_DIMENSION ||
    output.info.height >
      PROFILE_MEDIA_MAX_CANONICAL_DIMENSION ||
    output.info.width *
      output.info.height >
      PROFILE_MEDIA_MAX_CANONICAL_PIXELS
  ) {
    throw new ProfileMediaProcessingError(
      "Canonical Profile Media dimensions are invalid.",
    );
  }

  if (
    output.data.byteLength < 1 ||
    output.info.size !==
      output.data.byteLength
  ) {
    throw new ProfileMediaProcessingError(
      "Canonical Profile Media byte metadata is invalid.",
    );
  }

  return {
    bytes:
      output.data,
    contentType:
      PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
    byteSize:
      output.data.byteLength,
    width:
      output.info.width,
    height:
      output.info.height,
  };
}