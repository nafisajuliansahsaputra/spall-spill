"use server";

import { redirect } from "next/navigation";

import {
  resolveCurrentBasicIdentityState,
} from "@/lib/onboarding/state";
import {
  finalizeProfileMediaUpload,
} from "@/lib/profile-media/finalization";
import {
  initiateProfileMediaUpload,
} from "@/lib/profile-media/initiation";
import {
  createTrustedProfileMediaPreviewUrl,
} from "@/lib/profile-media/preview";

export type SavedProfileMediaPreviewRefreshResult =
  | Readonly<{
      status: "success";
      assetKey: string;
      previewUrl: string;
    }>
  | Readonly<{
      status: "no_saved_media";
    }>
  | Readonly<{
      status: "preview_unavailable";
      assetKey: string;
    }>
  | Readonly<{
      status: "internal_error";
    }>;

export async function initiateProfileMediaUploadAction(
  input: Readonly<{
    contentType: string;
    declaredByteSize: number;
  }>,
) {
  let result:
    | Awaited<
        ReturnType<
          typeof initiateProfileMediaUpload
        >
      >
    | {
        status: "internal_error";
      };

  try {
    result =
      await initiateProfileMediaUpload(
        {
          contentType:
            input.contentType,
          declaredByteSize:
            input.declaredByteSize,
        },
      );
  } catch {
    result = {
      status: "internal_error",
    };
  }

  switch (result.status) {
    case "unauthenticated":
    case "owner_unavailable":
      redirect("/auth/resolve");

    case "step_not_available":
      redirect("/onboarding");

    default:
      return result;
  }
}

export async function finalizeProfileMediaUploadAction(
  uploadIntentId: string,
) {
  let result:
    | Awaited<
        ReturnType<
          typeof finalizeProfileMediaUpload
        >
      >
    | {
        status: "internal_error";
      };

  try {
    result =
      await finalizeProfileMediaUpload(
        {
          uploadIntentId,
        },
      );
  } catch {
    result = {
      status: "internal_error",
    };
  }

  switch (result.status) {
    case "unauthenticated":
    case "owner_unavailable":
      redirect("/auth/resolve");

    default:
      return result;
  }
}

/*
 * Refresh the preview of the current authoritative
 * Saved / Working Profile Media.
 *
 * This action deliberately accepts NO asset key from
 * the browser. The current authenticated Owner and
 * current Saved profile_asset_key are resolved again
 * on the server before a fresh short-lived read URL
 * is issued.
 */
export async function refreshSavedProfileMediaPreviewAction(): Promise<SavedProfileMediaPreviewRefreshResult> {
  let identityState:
    Awaited<
      ReturnType<
        typeof resolveCurrentBasicIdentityState
      >
    >;

  try {
    identityState =
      await resolveCurrentBasicIdentityState();
  } catch {
    return {
      status: "internal_error",
    };
  }

  switch (identityState.status) {
    case "unauthenticated":
    case "owner_missing":
    case "owner_unavailable":
    case "onboarding_complete":
      redirect("/auth/resolve");

    case "progress_missing":
      return {
        status: "internal_error",
      };

    case "success":
      break;
  }

  const assetKey =
    identityState.identityWorking
      ?.profileAssetKey ??
    null;

  if (!assetKey) {
    return {
      status: "no_saved_media",
    };
  }

  const previewUrl =
    await createTrustedProfileMediaPreviewUrl(
      assetKey,
    );

  if (!previewUrl) {
    return {
      status:
        "preview_unavailable",
      assetKey,
    };
  }

  return {
    status: "success",
    assetKey,
    previewUrl,
  };
}