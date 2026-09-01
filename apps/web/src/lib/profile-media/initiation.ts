import "server-only";

import {
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { resolveProfileMediaAuthPrincipal } from "@/lib/profile-media/auth";
import {
  PROFILE_MEDIA_PRESIGNED_PUT_TTL_SECONDS,
  profileMediaDeclaredByteSizeSchema,
  profileMediaSourceContentTypeSchema,
  type ProfileMediaSourceContentType,
} from "@/lib/profile-media/contracts";
import { createProfileMediaUploadIntent } from "@/lib/profile-media/database";
import { createProfileMediaR2Connection } from "@/lib/profile-media/r2";

const PROFILE_MEDIA_SIGNED_UPLOAD_HEADERS =
  new Set([
    "content-type",
  ]);

export type ProfileMediaUploadInitiationInput =
  Readonly<{
    contentType: unknown;
    declaredByteSize: unknown;
  }>;

export type ProfileMediaUploadInitiationSuccess =
  Readonly<{
    status: "success";
    uploadIntentId: string;
    uploadUrl: string;
    expectedContentType:
      ProfileMediaSourceContentType;
    requiredHeaders: Readonly<{
      "Content-Type":
        ProfileMediaSourceContentType;
    }>;
    expiresAt: string;
  }>;

export type ProfileMediaUploadInitiationResult =
  | ProfileMediaUploadInitiationSuccess
  | Readonly<{
      status: "unauthenticated";
    }>
  | Readonly<{
      status: "invalid_content_type";
    }>
  | Readonly<{
      status: "invalid_byte_size";
    }>
  | Readonly<{
      status: "owner_unavailable";
    }>
  | Readonly<{
      status: "step_not_available";
    }>;

export class ProfileMediaUploadInitiationError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ProfileMediaUploadInitiationError";
  }
}

function parseUploadInitiationInput(
  input: ProfileMediaUploadInitiationInput,
):
  | {
      success: true;
      data: {
        contentType:
          ProfileMediaSourceContentType;
        declaredByteSize: number;
      };
    }
  | {
      success: false;
      status:
        | "invalid_content_type"
        | "invalid_byte_size";
    } {
  const parsedContentType =
    profileMediaSourceContentTypeSchema.safeParse(
      input.contentType,
    );

  if (!parsedContentType.success) {
    return {
      success: false,
      status:
        "invalid_content_type",
    };
  }

  const parsedByteSize =
    profileMediaDeclaredByteSizeSchema.safeParse(
      input.declaredByteSize,
    );

  if (!parsedByteSize.success) {
    return {
      success: false,
      status:
        "invalid_byte_size",
    };
  }

  return {
    success: true,
    data: {
      contentType:
        parsedContentType.data,
      declaredByteSize:
        parsedByteSize.data,
    },
  };
}

function resolveSigningTtlSeconds(
  expiresAt: string,
): number {
  const expiresAtMilliseconds =
    Date.parse(expiresAt);

  if (
    Number.isNaN(
      expiresAtMilliseconds,
    )
  ) {
    throw new ProfileMediaUploadInitiationError(
      "Profile Media upload intent returned an invalid expiry timestamp.",
    );
  }

  const remainingMilliseconds =
    expiresAtMilliseconds -
    Date.now();

  const remainingSeconds =
    Math.floor(
      remainingMilliseconds /
        1000,
    );

  if (remainingSeconds < 1) {
    throw new ProfileMediaUploadInitiationError(
      "Profile Media upload intent expired before signing could complete.",
    );
  }

  return Math.min(
    PROFILE_MEDIA_PRESIGNED_PUT_TTL_SECONDS,
    remainingSeconds,
  );
}

export async function initiateProfileMediaUpload(
  input: ProfileMediaUploadInitiationInput,
): Promise<ProfileMediaUploadInitiationResult> {
  /*
   * Verify authentication through the normal
   * request-scoped Supabase client before any
   * elevated database operation is allowed.
   */
  const principal =
    await resolveProfileMediaAuthPrincipal();

  if (
    principal.status !==
    "authenticated"
  ) {
    return {
      status: "unauthenticated",
    };
  }

  const parsedInput =
    parseUploadInitiationInput(
      input,
    );

  if (!parsedInput.success) {
    return {
      status:
        parsedInput.status,
    };
  }

  const intent =
    await createProfileMediaUploadIntent(
      {
        authUserId:
          principal.authUserId,
        expectedContentType:
          parsedInput.data
            .contentType,
        declaredByteSize:
          parsedInput.data
            .declaredByteSize,
      },
    );

  switch (intent.status) {
    case "invalid_content_type":
      return {
        status:
          "invalid_content_type",
      };

    case "invalid_byte_size":
      return {
        status:
          "invalid_byte_size",
      };

    case "step_not_available":
      return {
        status:
          "step_not_available",
      };

    case "owner_missing":
    case "owner_not_eligible":
    case "progress_missing":
      return {
        status:
          "owner_unavailable",
      };

    case "success":
      break;
  }

  /*
   * Once the authoritative database intent exists,
   * use its values instead of trusting the original
   * browser input again.
   */
  const signingTtlSeconds =
    resolveSigningTtlSeconds(
      intent.expires_at,
    );

  const {
    client,
    bucket,
  } =
    createProfileMediaR2Connection();

  const command =
    new PutObjectCommand({
      Bucket: bucket,
      Key:
        intent.staging_object_key,
      ContentType:
        intent.expected_content_type,
    });

  let uploadUrl: string;

  try {
    uploadUrl =
      await getSignedUrl(
        client,
        command,
        {
          expiresIn:
            signingTtlSeconds,

          /*
           * AWS SDK v3 does not guarantee that a
           * non-x-amz header such as Content-Type
           * participates in SigV4 unless it is
           * explicitly marked signable.
           *
           * Profile Media requires MIME binding, so
           * content-type must be part of
           * X-Amz-SignedHeaders.
           */
          signableHeaders:
            PROFILE_MEDIA_SIGNED_UPLOAD_HEADERS,
        },
      );
  } catch {
    /*
     * Never surface credentials, staging keys,
     * presigned URLs, or provider error payloads.
     *
     * If signing fails after the DB intent exists,
     * the unused pending intent is safe to expire
     * naturally.
     */
    throw new ProfileMediaUploadInitiationError(
      "Profile Media upload signing failed.",
    );
  }

  return {
    status: "success",
    uploadIntentId:
      intent.upload_intent_id,
    uploadUrl,
    expectedContentType:
      intent.expected_content_type,
    requiredHeaders: {
      "Content-Type":
        intent.expected_content_type,
    },
    expiresAt:
      intent.expires_at,
  };
}