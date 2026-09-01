import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { resolveProfileMediaAuthPrincipal } from "@/lib/profile-media/auth";
import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
} from "@/lib/profile-media/contracts";
import {
  completeProfileMediaUpload,
  resolveProfileMediaUploadIntent,
} from "@/lib/profile-media/database";
import {
  deleteProfileMediaStagingObjectBestEffort,
  loadProfileMediaStagingObject,
  putCanonicalProfileMediaObject,
} from "@/lib/profile-media/object-store";
import { processProfileMediaSource } from "@/lib/profile-media/processor";

const uploadIntentIdSchema =
  z.string().uuid();

export type ProfileMediaFinalizationInput =
  Readonly<{
    uploadIntentId: unknown;
  }>;

export type ProfileMediaFinalizationSuccess =
  Readonly<{
    status: "success";
    assetKey: string;
    contentType:
      typeof PROFILE_MEDIA_CANONICAL_CONTENT_TYPE;
    byteSize: number;
    width: number;
    height: number;
    idempotent: boolean;
  }>;

export type ProfileMediaFinalizationResult =
  | ProfileMediaFinalizationSuccess
  | Readonly<{
      status: "unauthenticated";
    }>
  | Readonly<{
      status: "invalid_upload_intent";
    }>
  | Readonly<{
      status: "owner_unavailable";
    }>
  | Readonly<{
      status: "intent_missing";
    }>
  | Readonly<{
      status: "processing";
    }>
  | Readonly<{
      status: "expired";
    }>
  | Readonly<{
      status: "rejected";
    }>;

export class ProfileMediaFinalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ProfileMediaFinalizationError";
  }
}

function createCanonicalObjectKey(
  assetKey: string,
): string {
  return (
    "working/profile/" +
    assetKey +
    ".webp"
  );
}

export async function finalizeProfileMediaUpload(
  input: ProfileMediaFinalizationInput,
): Promise<ProfileMediaFinalizationResult> {
  /*
   * Re-authenticate through the normal request-scoped
   * Supabase session. Elevated database authority is
   * never used as the browser authentication source.
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

  const parsedUploadIntentId =
    uploadIntentIdSchema.safeParse(
      input.uploadIntentId,
    );

  if (!parsedUploadIntentId.success) {
    return {
      status:
        "invalid_upload_intent",
    };
  }

  /*
   * Resolve and exclusively claim the authoritative
   * Owner-scoped intent before reading any R2 object.
   *
   * The first pending resolver transitions the intent
   * to processing while holding the database row lock.
   * Concurrent callers therefore cannot start a second
   * canonicalization pipeline for the same intent.
   */
  const intent =
    await resolveProfileMediaUploadIntent(
      {
        authUserId:
          principal.authUserId,
        uploadIntentId:
          parsedUploadIntentId.data,
      },
    );

  switch (intent.status) {
    case "owner_missing":
    case "owner_not_eligible":
      return {
        status:
          "owner_unavailable",
      };

    case "intent_missing":
      return {
        status:
          "intent_missing",
      };

    case "processing":
      return {
        status:
          "processing",
      };

    case "expired":
      return {
        status: "expired",
      };

    case "rejected":
      return {
        status: "rejected",
      };

    case "asset_missing":
      throw new ProfileMediaFinalizationError(
        "Consumed Profile Media intent is missing its canonical asset.",
      );

    case "consumed":
      /*
       * Lost-response / duplicate-finalization
       * recovery. The database already knows the
       * canonical asset, so no R2 processing or new
       * asset creation is necessary.
       */
      return {
        status: "success",
        assetKey:
          intent.asset_key,
        contentType:
          intent.stored_content_type,
        byteSize:
          intent.byte_size,
        width:
          intent.width,
        height:
          intent.height,
        idempotent: true,
      };

    case "success":
      break;
  }

  /*
   * HEAD + GET the exact staging object selected by
   * the authoritative database intent.
   *
   * Browser-supplied filenames, paths, MIME values,
   * and byte sizes are never trusted here.
   */
  const stagingObject =
    await loadProfileMediaStagingObject(
      {
        objectKey:
          intent.staging_object_key,
        expectedContentType:
          intent.expected_content_type,
      },
    );

  /*
   * Decode the untrusted staging bytes and create a
   * sanitized static canonical WebP.
   */
  const processed =
    await processProfileMediaSource(
      {
        bytes:
          stagingObject.bytes,
        expectedContentType:
          stagingObject.contentType,
      },
    );

  /*
   * Every canonical asset receives a fresh opaque
   * immutable identity. Handles and filenames never
   * participate in storage identity.
   */
  const assetKey =
    randomUUID();

  const objectKey =
    createCanonicalObjectKey(
      assetKey,
    );

  /*
   * Canonical R2 creation happens before database
   * registration. PutObject uses If-None-Match "*"
   * so an existing canonical key is never silently
   * overwritten.
   */
  await putCanonicalProfileMediaObject(
    {
      objectKey,
      bytes:
        processed.bytes,
    },
  );

  /*
   * Register the immutable canonical object and
   * consume the upload intent atomically inside the
   * database boundary.
   *
   * If this step fails after the R2 PUT, the object
   * remains an unattached orphan and Identity Working
   * stays unchanged. Safe GC can remove such orphans
   * later.
   */
  const completion =
    await completeProfileMediaUpload(
      {
        authUserId:
          principal.authUserId,
        uploadIntentId:
          parsedUploadIntentId.data,
        assetKey,
        objectKey,
        byteSize:
          processed.byteSize,
        width:
          processed.width,
        height:
          processed.height,
      },
    );

  switch (completion.status) {
    case "owner_missing":
    case "owner_not_eligible":
      return {
        status:
          "owner_unavailable",
      };

    case "intent_missing":
      return {
        status:
          "intent_missing",
      };

    case "expired":
      return {
        status: "expired",
      };

    case "rejected":
      return {
        status: "rejected",
      };

    case "asset_missing":
      throw new ProfileMediaFinalizationError(
        "Profile Media completion could not recover its canonical asset.",
      );

    case "invalid_asset_metadata":
      throw new ProfileMediaFinalizationError(
        "Profile Media canonical metadata was rejected by the database.",
      );

    case "asset_conflict":
      throw new ProfileMediaFinalizationError(
        "Profile Media canonical asset registration conflicted.",
      );

    case "success":
      break;
  }

  /*
   * Staging cleanup is defense in depth only.
   * A valid registered canonical asset must not be
   * rolled back merely because DeleteObject fails.
   */
  await deleteProfileMediaStagingObjectBestEffort(
    intent.staging_object_key,
  );

  return {
    status: "success",
    assetKey:
      completion.asset_key,
    contentType:
      completion.stored_content_type,
    byteSize:
      completion.byte_size,
    width:
      completion.width,
    height:
      completion.height,
    idempotent:
      completion.idempotent,
  };
}