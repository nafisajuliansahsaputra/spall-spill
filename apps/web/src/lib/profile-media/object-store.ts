import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";
import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  PROFILE_MEDIA_MAX_CANONICAL_BYTES,
  PROFILE_MEDIA_SANITIZER_SOURCE_GET_TTL_SECONDS,
} from "@spall-spill/profile-media-policy";

import {
  createProfileMediaR2Connection,
} from "@/lib/profile-media/r2";

const UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const STAGING_OBJECT_KEY_PATTERN =
  new RegExp(
    `^staging/profile/${UUID_PATTERN}/${UUID_PATTERN}$`,
  );

const CANONICAL_OBJECT_KEY_PATTERN =
  new RegExp(
    `^working/profile/${UUID_PATTERN}\\.webp$`,
  );

export class ProfileMediaObjectStoreError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "ProfileMediaObjectStoreError";
  }
}

function assertStagingObjectKey(
  objectKey: string,
): void {
  if (
    !STAGING_OBJECT_KEY_PATTERN.test(
      objectKey,
    )
  ) {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object key is outside the allowed namespace.",
    );
  }
}

function assertCanonicalObjectKey(
  objectKey: string,
): void {
  if (
    !CANONICAL_OBJECT_KEY_PATTERN.test(
      objectKey,
    )
  ) {
    throw new ProfileMediaObjectStoreError(
      "Canonical Profile Media object key is outside the allowed namespace.",
    );
  }
}

function assertCanonicalWebp(
  bytes: Buffer,
): void {
  if (
    bytes.byteLength < 12 ||
    bytes.byteLength >
      PROFILE_MEDIA_MAX_CANONICAL_BYTES ||
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
    throw new ProfileMediaObjectStoreError(
      "Canonical Profile Media bytes are not a valid bounded WebP container.",
    );
  }
}

export async function createProfileMediaStagingDownloadUrl(
  input: Readonly<{
    objectKey: string;
  }>,
): Promise<string> {
  assertStagingObjectKey(
    input.objectKey,
  );

  const {
    client,
    bucket,
  } =
    createProfileMediaR2Connection();

  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: input.objectKey,
      }),
      {
        expiresIn:
          PROFILE_MEDIA_SANITIZER_SOURCE_GET_TTL_SECONDS,
      },
    );
  } catch {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging download capability could not be created.",
    );
  }
}

export async function putCanonicalProfileMediaObject(
  input: Readonly<{
    objectKey: string;
    bytes: Buffer;
  }>,
): Promise<void> {
  assertCanonicalObjectKey(
    input.objectKey,
  );

  assertCanonicalWebp(
    input.bytes,
  );

  const {
    client,
    bucket,
  } =
    createProfileMediaR2Connection();

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.objectKey,
        Body: input.bytes,

        ContentLength:
          input.bytes.byteLength,

        ContentType:
          PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,

        /*
         * Canonical Profile Media is immutable.
         * Existing objects are never silently replaced.
         */
        IfNoneMatch: "*",
      }),
    );
  } catch {
    throw new ProfileMediaObjectStoreError(
      "Canonical Profile Media object could not be stored.",
    );
  }
}

export async function deleteProfileMediaStagingObjectBestEffort(
  objectKey: string,
): Promise<void> {
  /*
   * Cleanup must never gain authority over the
   * canonical Working namespace.
   */
  if (
    !STAGING_OBJECT_KEY_PATTERN.test(
      objectKey,
    )
  ) {
    return;
  }

  const {
    client,
    bucket,
  } =
    createProfileMediaR2Connection();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  } catch {
    /*
     * Successful canonicalization and database
     * registration are not rolled back if cleanup
     * fails. Bucket lifecycle cleanup remains the
     * secondary boundary.
     */
  }
}