import {
  profileMediaDeclaredByteSizeSchema,
  profileMediaSourceContentTypeSchema,
  type ProfileMediaSourceContentType,
} from "@/lib/profile-media/contracts";

type UploadInitiationSuccess =
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

type UploadInitiationResult =
  | UploadInitiationSuccess
  | Readonly<{
      status:
        "invalid_content_type";
    }>
  | Readonly<{
      status:
        "invalid_byte_size";
    }>
  | Readonly<{
      status:
        "internal_error";
    }>;

type FinalizationSuccess =
  Readonly<{
    status: "success";
    assetKey: string;
    contentType: "image/webp";
    byteSize: number;
    width: number;
    height: number;
    idempotent: boolean;
  }>;

type FinalizationResult =
  | FinalizationSuccess
  | Readonly<{
      status:
        "invalid_upload_intent";
    }>
  | Readonly<{
      status:
        "intent_missing";
    }>
  | Readonly<{
      status:
        "processing";
    }>
  | Readonly<{
      status:
        "expired";
    }>
  | Readonly<{
      status:
        "rejected";
    }>
  | Readonly<{
      status:
        "internal_error";
    }>;

export type ProfileMediaUploadPhase =
  | "uploading"
  | "processing";

export type ProfileMediaInvalidFileReason =
  | "unsupported_type"
  | "invalid_size";

export type ProfileMediaBrowserFileValidationResult =
  | Readonly<{
      status: "valid";
      contentType:
        ProfileMediaSourceContentType;
      byteSize: number;
    }>
  | Readonly<{
      status: "invalid_file";
      reason:
        ProfileMediaInvalidFileReason;
    }>;

export type ProfileMediaBrowserUploadResult =
  | Readonly<{
      status: "success";
      assetKey: string;
      byteSize: number;
      width: number;
      height: number;
      idempotent: boolean;
    }>
  | Readonly<{
      status: "invalid_file";
      reason:
        ProfileMediaInvalidFileReason;
    }>
  | Readonly<{
      status: "initiation_failed";
    }>
  | Readonly<{
      status: "upload_failed";
    }>
  | Readonly<{
      status: "finalization_failed";
      reason:
        | "missing"
        | "expired"
        | "rejected"
        | "processing_timeout"
        | "internal";
    }>;

type InitiateOperation = (
  input: Readonly<{
    contentType: string;
    declaredByteSize: number;
  }>,
) => Promise<UploadInitiationResult>;

type FinalizeOperation = (
  uploadIntentId: string,
) => Promise<FinalizationResult>;

const FINALIZATION_MAX_ATTEMPTS = 4;
const FINALIZATION_RETRY_DELAY_MS = 400;

function defaultSleep(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(
      resolve,
      milliseconds,
    );
  });
}

export function validateProfileMediaBrowserFile(
  file: Pick<File, "type" | "size">,
): ProfileMediaBrowserFileValidationResult {
  const parsedContentType =
    profileMediaSourceContentTypeSchema.safeParse(
      file.type,
    );

  if (!parsedContentType.success) {
    return {
      status: "invalid_file",
      reason:
        "unsupported_type",
    };
  }

  const parsedByteSize =
    profileMediaDeclaredByteSizeSchema.safeParse(
      file.size,
    );

  if (!parsedByteSize.success) {
    return {
      status: "invalid_file",
      reason: "invalid_size",
    };
  }

  return {
    status: "valid",
    contentType:
      parsedContentType.data,
    byteSize:
      parsedByteSize.data,
  };
}

export async function uploadProfileMediaFile({
  file,
  initiate,
  finalize,
  onPhase,
  sleep = defaultSleep,
}: Readonly<{
  file: File;
  initiate: InitiateOperation;
  finalize: FinalizeOperation;
  onPhase?: (
    phase: ProfileMediaUploadPhase,
  ) => void;
  sleep?: (
    milliseconds: number,
  ) => Promise<void>;
}>): Promise<ProfileMediaBrowserUploadResult> {
  const validation =
    validateProfileMediaBrowserFile(
      file,
    );

  if (
    validation.status ===
    "invalid_file"
  ) {
    return validation;
  }

  let initiation: UploadInitiationResult;

  try {
    initiation =
      await initiate({
        contentType:
          validation.contentType,
        declaredByteSize:
          validation.byteSize,
      });
  } catch {
    return {
      status:
        "initiation_failed",
    };
  }

  switch (initiation.status) {
    case "invalid_content_type":
      return {
        status: "invalid_file",
        reason:
          "unsupported_type",
      };

    case "invalid_byte_size":
      return {
        status: "invalid_file",
        reason: "invalid_size",
      };

    case "internal_error":
      return {
        status:
          "initiation_failed",
      };

    case "success":
      break;
  }

  onPhase?.("uploading");

  let uploadResponse: Response;

  try {
    uploadResponse =
      await fetch(
        initiation.uploadUrl,
        {
          method: "PUT",
          headers:
            initiation.requiredHeaders,
          body: file,
          credentials: "omit",
          redirect: "error",
          referrerPolicy:
            "no-referrer",
        },
      );
  } catch {
    return {
      status: "upload_failed",
    };
  }

  if (!uploadResponse.ok) {
    return {
      status: "upload_failed",
    };
  }

  onPhase?.("processing");

  for (
    let attempt = 0;
    attempt <
    FINALIZATION_MAX_ATTEMPTS;
    attempt += 1
  ) {
    let finalization:
      FinalizationResult;

    try {
      finalization =
        await finalize(
          initiation.uploadIntentId,
        );
    } catch {
      if (
        attempt <
        FINALIZATION_MAX_ATTEMPTS -
          1
      ) {
        await sleep(
          FINALIZATION_RETRY_DELAY_MS,
        );

        continue;
      }

      return {
        status:
          "finalization_failed",
        reason: "internal",
      };
    }

    switch (finalization.status) {
      case "success":
        return {
          status: "success",
          assetKey:
            finalization.assetKey,
          byteSize:
            finalization.byteSize,
          width:
            finalization.width,
          height:
            finalization.height,
          idempotent:
            finalization.idempotent,
        };

      case "processing":
      case "internal_error":
        if (
          attempt <
          FINALIZATION_MAX_ATTEMPTS -
            1
        ) {
          await sleep(
            FINALIZATION_RETRY_DELAY_MS,
          );

          continue;
        }

        return {
          status:
            "finalization_failed",
          reason:
            finalization.status ===
            "processing"
              ? "processing_timeout"
              : "internal",
        };

      case "expired":
        return {
          status:
            "finalization_failed",
          reason: "expired",
        };

      case "rejected":
        return {
          status:
            "finalization_failed",
          reason: "rejected",
        };

      case "invalid_upload_intent":
      case "intent_missing":
        return {
          status:
            "finalization_failed",
          reason: "missing",
        };
    }
  }

  return {
    status: "finalization_failed",
    reason: "processing_timeout",
  };
}