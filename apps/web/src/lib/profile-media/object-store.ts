import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  PROFILE_MEDIA_MAX_SOURCE_BYTES,
  type ProfileMediaSourceContentType,
} from "@/lib/profile-media/contracts";
import { createProfileMediaR2Connection } from "@/lib/profile-media/r2";

export type ProfileMediaStagingObject =
  Readonly<{
    bytes: Buffer;
    contentType:
      ProfileMediaSourceContentType;
    byteSize: number;
  }>;

export class ProfileMediaObjectStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ProfileMediaObjectStoreError";
  }
}

function normalizeContentType(
  value: string | undefined,
): string | null {
  const normalized =
    value?.trim().toLowerCase();

  return normalized
    ? normalized
    : null;
}

function assertValidSourceByteSize(
  value: number | undefined,
): number {
  if (
    value === undefined ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value >
      PROFILE_MEDIA_MAX_SOURCE_BYTES
  ) {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object has an invalid authoritative byte size.",
    );
  }

  return value;
}

export async function loadProfileMediaStagingObject(
  input: Readonly<{
    objectKey: string;
    expectedContentType:
      ProfileMediaSourceContentType;
  }>,
): Promise<ProfileMediaStagingObject> {
  const {
    client,
    bucket,
  } =
    createProfileMediaR2Connection();

  let authoritativeByteSize: number;
  let authoritativeContentType: string | null;

  try {
    const head =
      await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: input.objectKey,
        }),
      );

    authoritativeByteSize =
      assertValidSourceByteSize(
        head.ContentLength,
      );

    authoritativeContentType =
      normalizeContentType(
        head.ContentType,
      );
  } catch (error) {
    if (
      error instanceof
      ProfileMediaObjectStoreError
    ) {
      throw error;
    }

    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object could not be inspected.",
    );
  }

  if (
    authoritativeContentType !==
    input.expectedContentType
  ) {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object Content-Type does not match its upload intent.",
    );
  }

  let response;

  try {
    response =
      await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: input.objectKey,
        }),
      );
  } catch {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object could not be loaded.",
    );
  }

  const responseContentType =
    normalizeContentType(
      response.ContentType,
    );

  if (
    responseContentType !==
    input.expectedContentType
  ) {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object changed between inspection and download.",
    );
  }

  if (
    response.ContentLength !==
      undefined &&
    response.ContentLength !==
      authoritativeByteSize
  ) {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object size changed between inspection and download.",
    );
  }

  if (!response.Body) {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object returned no body.",
    );
  }

  let bytes: Buffer;

  try {
    const byteArray =
      await response.Body
        .transformToByteArray();

    bytes =
      Buffer.from(byteArray);
  } catch {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object body could not be read.",
    );
  }

  if (
    bytes.byteLength !==
      authoritativeByteSize ||
    bytes.byteLength < 1 ||
    bytes.byteLength >
      PROFILE_MEDIA_MAX_SOURCE_BYTES
  ) {
    throw new ProfileMediaObjectStoreError(
      "Profile Media staging object body size is invalid.",
    );
  }

  return {
    bytes,
    contentType:
      input.expectedContentType,
    byteSize:
      authoritativeByteSize,
  };
}

export async function putCanonicalProfileMediaObject(
  input: Readonly<{
    objectKey: string;
    bytes: Buffer;
  }>,
): Promise<void> {
  if (input.bytes.byteLength < 1) {
    throw new ProfileMediaObjectStoreError(
      "Canonical Profile Media bytes are empty.",
    );
  }

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
         * Never silently overwrite an existing key.
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
     * registration must not be rolled back merely
     * because staging cleanup failed.
     *
     * The bucket lifecycle rule remains the
     * secondary cleanup boundary.
     */
  }
}