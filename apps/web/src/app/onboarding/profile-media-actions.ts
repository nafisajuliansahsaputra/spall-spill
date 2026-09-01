"use server";

import { redirect } from "next/navigation";

import {
  finalizeProfileMediaUpload,
} from "@/lib/profile-media/finalization";
import {
  initiateProfileMediaUpload,
} from "@/lib/profile-media/initiation";

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