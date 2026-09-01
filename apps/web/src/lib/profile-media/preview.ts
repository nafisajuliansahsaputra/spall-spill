import "server-only";

import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import {
  getSignedUrl,
} from "@aws-sdk/s3-request-presigner";

import {
  PROFILE_MEDIA_PRESIGNED_GET_TTL_SECONDS,
  profileMediaAssetKeySchema,
} from "@/lib/profile-media/contracts";
import {
  createProfileMediaR2Connection,
} from "@/lib/profile-media/r2";

/*
 * This function is intentionally NOT a generic
 * browser-facing "asset key -> URL" resolver.
 *
 * Call it only with an asset key already obtained
 * from trusted current-Owner authoritative state.
 */
export async function createTrustedProfileMediaPreviewUrl(
  assetKey: string,
): Promise<string | null> {
  const parsedAssetKey =
    profileMediaAssetKeySchema.safeParse(
      assetKey,
    );

  if (!parsedAssetKey.success) {
    return null;
  }

  try {
    const {
      client,
      bucket,
    } =
      createProfileMediaR2Connection();

    const command =
      new GetObjectCommand({
        Bucket: bucket,
        Key:
          `working/profile/${parsedAssetKey.data}.webp`,
      });

    return await getSignedUrl(
      client,
      command,
      {
        expiresIn:
          PROFILE_MEDIA_PRESIGNED_GET_TTL_SECONDS,
      },
    );
  } catch {
    /*
     * Profile media is optional. Temporary preview
     * unavailability must not break Basic Identity
     * rendering or make Display Name unusable.
     *
     * Do not surface provider payloads, credentials,
     * or object details through this boundary.
     */
    return null;
  }
}