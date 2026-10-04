import sharp from "sharp";

import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  PROFILE_MEDIA_CANONICAL_WEBP_QUALITY,
  PROFILE_MEDIA_MAX_CANONICAL_BYTES,
  PROFILE_MEDIA_MAX_CANONICAL_DIMENSION,
  PROFILE_MEDIA_MAX_CANONICAL_PIXELS,
  PROFILE_MEDIA_MAX_SOURCE_BYTES,
  PROFILE_MEDIA_MAX_SOURCE_DIMENSION,
  PROFILE_MEDIA_MAX_SOURCE_PIXELS,
  type ProfileMediaSourceContentType,
} from "@spall-spill/profile-media-policy";

const PNG_SIGNATURE =
  Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ]);

const PNG_IEND_PREFIX =
  Buffer.from([
    0x00,
    0x00,
    0x00,
    0x00,
    0x49,
    0x45,
    0x4e,
    0x44,
  ]);

const RIFF =
  Buffer.from(
    "RIFF",
    "ascii",
  );

const WEBP =
  Buffer.from(
    "WEBP",
    "ascii",
  );

const FORMAT_TYPES = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export type SanitizedMedia =
  Readonly<{
    bytes: Buffer;
    contentType:
      typeof PROFILE_MEDIA_CANONICAL_CONTENT_TYPE;
    byteSize: number;
    width: number;
    height: number;
  }>;

export class MediaSanitizerProcessingError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "MediaSanitizerProcessingError";
  }
}

function rejectEnvelope():
  never {
  throw new MediaSanitizerProcessingError(
    "Source image container is invalid.",
  );
}

function assertEnvelope(
  bytes: Buffer,
  expectedContentType:
    ProfileMediaSourceContentType,
): void {
  switch (
    expectedContentType
  ) {
    case "image/jpeg":
      if (
        bytes.byteLength < 5 ||
        bytes[0] !== 0xff ||
        bytes[1] !== 0xd8 ||
        bytes[2] !== 0xff ||
        bytes[
          bytes.byteLength - 2
        ] !== 0xff ||
        bytes[
          bytes.byteLength - 1
        ] !== 0xd9
      ) {
        rejectEnvelope();
      }

      return;

    case "image/png":
      if (
        bytes.byteLength < 20 ||
        !bytes
          .subarray(0, 8)
          .equals(
            PNG_SIGNATURE,
          ) ||
        !bytes
          .subarray(
            bytes.byteLength - 12,
            bytes.byteLength - 4,
          )
          .equals(
            PNG_IEND_PREFIX,
          )
      ) {
        rejectEnvelope();
      }

      return;

    case "image/webp": {
      if (
        bytes.byteLength < 12 ||
        !bytes
          .subarray(0, 4)
          .equals(RIFF) ||
        !bytes
          .subarray(8, 12)
          .equals(WEBP)
      ) {
        rejectEnvelope();
      }

      const declaredLength =
        bytes.readUInt32LE(4) +
        8;

      if (
        declaredLength !==
          bytes.byteLength
      ) {
        rejectEnvelope();
      }

      return;
    }
  }
}

export async function sanitizeMedia(
  input: Readonly<{
    bytes: Buffer;
    expectedContentType:
      ProfileMediaSourceContentType;
  }>,
): Promise<SanitizedMedia> {
  if (
    input.bytes.byteLength < 1 ||
    input.bytes.byteLength >
      PROFILE_MEDIA_MAX_SOURCE_BYTES
  ) {
    throw new MediaSanitizerProcessingError(
      "Source image byte size is invalid.",
    );
  }

  assertEnvelope(
    input.bytes,
    input.expectedContentType,
  );

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
    throw new MediaSanitizerProcessingError(
      "Source image could not be decoded.",
    );
  }

  const decodedContentType =
    metadata.format &&
    Object.prototype.hasOwnProperty.call(
      FORMAT_TYPES,
      metadata.format,
    )
      ? FORMAT_TYPES[
          metadata.format as
            keyof typeof FORMAT_TYPES
        ]
      : null;

  if (
    decodedContentType !==
      input.expectedContentType
  ) {
    throw new MediaSanitizerProcessingError(
      "Decoded source type does not match the authoritative Content-Type.",
    );
  }

  const width =
    metadata.width;

  const height =
    metadata.height;

  if (
    !width ||
    !height ||
    !Number.isSafeInteger(
      width,
    ) ||
    !Number.isSafeInteger(
      height,
    ) ||
    width < 1 ||
    height < 1 ||
    width >
      PROFILE_MEDIA_MAX_SOURCE_DIMENSION ||
    height >
      PROFILE_MEDIA_MAX_SOURCE_DIMENSION ||
    width * height >
      PROFILE_MEDIA_MAX_SOURCE_PIXELS
  ) {
    throw new MediaSanitizerProcessingError(
      "Decoded source dimensions exceed policy.",
    );
  }

  if (
    !Number.isSafeInteger(
      metadata.pages ?? 1,
    ) ||
    (metadata.pages ?? 1) !==
      1
  ) {
    throw new MediaSanitizerProcessingError(
      "Animated or multi-page media is not accepted.",
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
    throw new MediaSanitizerProcessingError(
      "Source image could not be canonicalized.",
    );
  }

  if (
    output.info.format !==
      "webp" ||
    output.info.width < 1 ||
    output.info.height < 1 ||
    output.info.width >
      PROFILE_MEDIA_MAX_CANONICAL_DIMENSION ||
    output.info.height >
      PROFILE_MEDIA_MAX_CANONICAL_DIMENSION ||
    output.info.width *
      output.info.height >
      PROFILE_MEDIA_MAX_CANONICAL_PIXELS ||
    output.data.byteLength < 12 ||
    output.data.byteLength >
      PROFILE_MEDIA_MAX_CANONICAL_BYTES ||
    output.info.size !==
      output.data.byteLength
  ) {
    throw new MediaSanitizerProcessingError(
      "Canonical output violates media policy.",
    );
  }

  assertEnvelope(
    output.data,
    "image/webp",
  );

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