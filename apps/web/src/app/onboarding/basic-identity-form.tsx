"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import {
  uploadProfileMediaFile,
  validateProfileMediaBrowserFile,
  type ProfileMediaInvalidFileReason,
  type ProfileMediaUploadPhase,
} from "@/lib/profile-media/client-upload";

import {
  saveBasicIdentityAction,
} from "./actions";
import {
  finalizeProfileMediaUploadAction,
  initiateProfileMediaUploadAction,
  refreshSavedProfileMediaPreviewAction,
} from "./profile-media-actions";
import type {
  BasicIdentityActionState,
} from "./state";

type BasicIdentityFormProps = {
  initialDisplayName: string;
  initialBio: string | null;
  initialProfileAssetKey: string | null;
  initialProfilePreviewUrl: string | null;
  baseIdentityRevision: number | null;
  baseProgressRevision: number;
  isFrontier: boolean;
};

type MediaStatus =
  | "none"
  | "saved"
  | "selected"
  | "uploading"
  | "processing"
  | "ready"
  | "remove_pending"
  | "restoring";

function SubmitButton({
  isFrontier,
  mediaBusy,
}: {
  isFrontier: boolean;
  mediaBusy: boolean;
}) {
  const { pending } = useFormStatus();

  const disabled =
    pending || mediaBusy;

  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Saving Working..."
        : mediaBusy
          ? "Finish media operation first"
          : isFrontier
            ? "Continue"
            : "Save changes"}
    </button>
  );
}

function getMediaStatusText(
  status: MediaStatus,
): string {
  switch (status) {
    case "saved":
      return "Saved / Working. Changing this selection will not publish anything.";

    case "selected":
      return "Selected locally. Preparing a secure upload.";

    case "uploading":
      return "Uploading securely to temporary storage...";

    case "processing":
      return "Processing and validating the image...";

    case "ready":
      return "Ready, but not Saved yet. Continue or Save changes to attach it to Identity Working.";

    case "remove_pending":
      return "Removal selected locally. Save changes to remove it from Identity Working.";

    case "restoring":
      return "Refreshing your Saved / Working preview...";

    case "none":
      return "No Profile Photo / Logo is selected. This is optional.";
  }
}

function getInvalidFileMessage(
  reason:
    ProfileMediaInvalidFileReason,
): string {
  return reason ===
    "unsupported_type"
    ? "Use a JPEG, PNG, or WebP image."
    : "Choose an image no larger than 5 MiB.";
}

function getUploadErrorMessage(
  result:
    Awaited<
      ReturnType<
        typeof uploadProfileMediaFile
      >
    >,
): string | null {
  switch (result.status) {
    case "success":
      return null;

    case "invalid_file":
      return getInvalidFileMessage(
        result.reason,
      );

    case "initiation_failed":
      return "We couldn't start the secure upload. Your previous media selection is unchanged.";

    case "upload_failed":
      return "The image could not be uploaded to temporary storage. Your previous media selection is unchanged.";

    case "finalization_failed":
      switch (result.reason) {
        case "rejected":
          return "The image could not be safely processed. Use a valid static JPEG, PNG, or WebP image.";

        case "expired":
          return "The temporary upload session expired. Choose the image again to retry.";

        case "processing_timeout":
          return "Image processing did not finish in this request. Choose the image again to retry.";

        case "missing":
        case "internal":
          return "The image could not be finalized safely. Your previous media selection is unchanged.";
      }
  }
}

function combineMediaMessages(
  primary: string | null,
  secondary: string,
): string {
  return primary
    ? `${primary} ${secondary}`
    : secondary;
}

export function BasicIdentityForm({
  initialDisplayName,
  initialBio,
  initialProfileAssetKey,
  initialProfilePreviewUrl,
  baseIdentityRevision,
  baseProgressRevision,
  isFrontier,
}: BasicIdentityFormProps) {
  const initialState:
    BasicIdentityActionState = {
      status: "idle",
      message: null,
      displayName:
        initialDisplayName,
      bio: initialBio ?? "",
      profileAssetKey:
        initialProfileAssetKey,
      fieldErrors: {},
    };

  const [state, formAction] =
    useActionState(
      saveBasicIdentityAction,
      initialState,
    );

  const [
    savedProfileAssetKey,
    setSavedProfileAssetKey,
  ] = useState<string | null>(
    initialProfileAssetKey,
  );

  const [
    selectedProfileAssetKey,
    setSelectedProfileAssetKey,
  ] = useState<string | null>(
    initialProfileAssetKey,
  );

  const [
    previewUrl,
    setPreviewUrl,
  ] = useState<string | null>(
    initialProfilePreviewUrl,
  );

  const [
    mediaStatus,
    setMediaStatus,
  ] = useState<MediaStatus>(
    initialProfileAssetKey
      ? "saved"
      : "none",
  );

  const [
    mediaError,
    setMediaError,
  ] = useState<string | null>(
    null,
  );

  const objectUrlsRef =
    useRef<Set<string>>(
      new Set(),
    );

  useEffect(() => {
    const urls =
      objectUrlsRef.current;

    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }

      urls.clear();
    };
  }, []);

  const mediaBusy =
    mediaStatus === "selected" ||
    mediaStatus === "uploading" ||
    mediaStatus === "processing" ||
    mediaStatus === "restoring";

  function revokeTrackedObjectUrl(
    url: string | null,
  ) {
    if (
      !url ||
      !objectUrlsRef.current.has(url)
    ) {
      return;
    }

    URL.revokeObjectURL(url);

    objectUrlsRef.current.delete(
      url,
    );
  }

  async function restoreAuthoritativeSavedMedia(
    leadingError:
      string | null = null,
  ) {
    revokeTrackedObjectUrl(
      previewUrl,
    );

    /*
     * Keep the last acknowledged key as the fail-safe
     * intended selection while a fresh server-derived
     * Saved preview is being resolved.
     */
    setSelectedProfileAssetKey(
      savedProfileAssetKey,
    );

    setPreviewUrl(null);
    setMediaStatus("restoring");
    setMediaError(leadingError);

    let result:
      Awaited<
        ReturnType<
          typeof refreshSavedProfileMediaPreviewAction
        >
      >;

    try {
      result =
        await refreshSavedProfileMediaPreviewAction();
    } catch {
      setSelectedProfileAssetKey(
        savedProfileAssetKey,
      );

      setPreviewUrl(null);

      setMediaStatus(
        savedProfileAssetKey
          ? "saved"
          : "none",
      );

      setMediaError(
        combineMediaMessages(
          leadingError,
          "We couldn't refresh the Saved media preview. Your acknowledged media selection is unchanged.",
        ),
      );

      return;
    }

    switch (result.status) {
      case "success":
        setSavedProfileAssetKey(
          result.assetKey,
        );

        setSelectedProfileAssetKey(
          result.assetKey,
        );

        setPreviewUrl(
          result.previewUrl,
        );

        setMediaStatus("saved");
        setMediaError(
          leadingError,
        );

        return;

      case "no_saved_media":
        setSavedProfileAssetKey(
          null,
        );

        setSelectedProfileAssetKey(
          null,
        );

        setPreviewUrl(null);
        setMediaStatus("none");
        setMediaError(
          leadingError,
        );

        return;

      case "preview_unavailable":
        setSavedProfileAssetKey(
          result.assetKey,
        );

        setSelectedProfileAssetKey(
          result.assetKey,
        );

        setPreviewUrl(null);
        setMediaStatus("saved");

        setMediaError(
          combineMediaMessages(
            leadingError,
            "Your Saved media is still attached, but its preview is temporarily unavailable.",
          ),
        );

        return;

      case "internal_error":
        setSelectedProfileAssetKey(
          savedProfileAssetKey,
        );

        setPreviewUrl(null);

        setMediaStatus(
          savedProfileAssetKey
            ? "saved"
            : "none",
        );

        setMediaError(
          combineMediaMessages(
            leadingError,
            "We couldn't refresh the Saved media preview. Your acknowledged media selection is unchanged.",
          ),
        );

        return;
    }
  }

  function handleRemoveMedia() {
    if (mediaBusy) {
      return;
    }

    revokeTrackedObjectUrl(
      previewUrl,
    );

    setSelectedProfileAssetKey(
      null,
    );

    setPreviewUrl(null);

    setMediaStatus(
      savedProfileAssetKey
        ? "remove_pending"
        : "none",
    );

    setMediaError(null);
  }

  async function handleFileChange(
    event:
      React.ChangeEvent<HTMLInputElement>,
  ) {
    const file =
      event.currentTarget.files?.[0] ??
      null;

    event.currentTarget.value = "";

    if (!file || mediaBusy) {
      return;
    }

    /*
     * Validate before creating any local object URL.
     * Unsupported media must not enter even the
     * temporary preview path.
     *
     * This is UX defense in depth only; authoritative
     * validation still happens during server
     * finalization.
     */
    const validation =
      validateProfileMediaBrowserFile(
        file,
      );

    if (
      validation.status ===
      "invalid_file"
    ) {
      setMediaError(
        getInvalidFileMessage(
          validation.reason,
        ),
      );

      return;
    }

    const previousAssetKey =
      selectedProfileAssetKey;

    const previousPreviewUrl =
      previewUrl;

    const previousStatus =
      mediaStatus;

    const localPreviewUrl =
      URL.createObjectURL(file);

    objectUrlsRef.current.add(
      localPreviewUrl,
    );

    setMediaError(null);

    setPreviewUrl(
      localPreviewUrl,
    );

    setMediaStatus(
      "selected",
    );

    const result =
      await uploadProfileMediaFile({
        file,

        initiate:
          initiateProfileMediaUploadAction,

        finalize:
          finalizeProfileMediaUploadAction,

        onPhase: (
          phase:
            ProfileMediaUploadPhase,
        ) => {
          setMediaStatus(
            phase === "uploading"
              ? "uploading"
              : "processing",
          );
        },
      });

    if (result.status === "success") {
      revokeTrackedObjectUrl(
        previousPreviewUrl,
      );

      setSelectedProfileAssetKey(
        result.assetKey,
      );

      setPreviewUrl(
        localPreviewUrl,
      );

      setMediaStatus(
        "ready",
      );

      setMediaError(null);

      return;
    }

    revokeTrackedObjectUrl(
      localPreviewUrl,
    );

    const uploadError =
      getUploadErrorMessage(
        result,
      );

    /*
     * A prior Saved preview URL may have expired while
     * the replacement attempt was in progress. When
     * restoring Saved state, obtain a fresh URL from
     * authoritative current-Owner state instead of
     * reusing the old transport credential.
     */
    if (
      previousStatus ===
      "saved"
    ) {
      await restoreAuthoritativeSavedMedia(
        uploadError,
      );

      return;
    }

    setSelectedProfileAssetKey(
      previousAssetKey,
    );

    setPreviewUrl(
      previousPreviewUrl,
    );

    setMediaStatus(
      previousStatus,
    );

    setMediaError(
      uploadError,
    );
  }

  const previewLabel =
    selectedProfileAssetKey
      ? "Profile Photo / Logo preview"
      : "No Profile Photo / Logo";

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="baseIdentityRevision"
        value={
          baseIdentityRevision ?? ""
        }
      />

      <input
        type="hidden"
        name="baseProgressRevision"
        value={baseProgressRevision}
      />

      <input
        type="hidden"
        name="profileAssetKey"
        value={
          selectedProfileAssetKey ??
          ""
        }
      />

      <div className="space-y-2">
        <label
          htmlFor="displayName"
          className="block text-sm font-medium text-neutral-900"
        >
          Display Name
        </label>

        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          defaultValue={
            state.displayName
          }
          aria-invalid={
            state.fieldErrors.displayName
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.displayName
              ? "display-name-help display-name-error"
              : "display-name-help"
          }
          placeholder="Your name or brand"
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />

        <p
          id="display-name-help"
          className="text-sm leading-6 text-neutral-500"
        >
          Required. Up to 80
          characters. This is separate
          from your Handle.
        </p>

        {state.fieldErrors.displayName ? (
          <p
            id="display-name-error"
            className="text-sm text-red-700"
          >
            {
              state.fieldErrors
                .displayName
            }
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="bio"
          className="block text-sm font-medium text-neutral-900"
        >
          Bio{" "}
          <span className="font-normal text-neutral-500">
            (optional)
          </span>
        </label>

        <textarea
          id="bio"
          name="bio"
          rows={5}
          defaultValue={state.bio}
          aria-invalid={
            state.fieldErrors.bio
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.bio
              ? "bio-help bio-error"
              : "bio-help"
          }
          placeholder="A short description about you, your brand, or what people can find here."
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base leading-6 text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />

        <p
          id="bio-help"
          className="text-sm leading-6 text-neutral-500"
        >
          Optional. Plain text, up to
          300 characters.
        </p>

        {state.fieldErrors.bio ? (
          <p
            id="bio-error"
            className="text-sm text-red-700"
          >
            {state.fieldErrors.bio}
          </p>
        ) : null}
      </div>

      <fieldset
        disabled={mediaBusy}
        className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 disabled:opacity-75"
      >
        <legend className="px-1 text-sm font-medium text-neutral-900">
          Profile Photo / Logo{" "}
          <span className="font-normal text-neutral-500">
            (optional)
          </span>
        </legend>

        <div className="flex items-start gap-4">
          <div
            role="img"
            aria-label={previewLabel}
            className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-white bg-cover bg-center text-center text-xs leading-4 text-neutral-400"
            style={
              previewUrl
                ? {
                    backgroundImage:
                      `url("${previewUrl}")`,
                  }
                : undefined
            }
          >
            {!previewUrl
              ? selectedProfileAssetKey
                ? "Preview unavailable"
                : "No media"
              : null}
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="profileMedia"
                className="block text-sm font-medium text-neutral-800"
              >
                Choose an image
              </label>

              <input
                id="profileMedia"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                disabled={mediaBusy}
                onChange={
                  handleFileChange
                }
                aria-describedby="profile-media-help profile-media-status"
                className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-neutral-700 disabled:cursor-not-allowed"
              />

              <p
                id="profile-media-help"
                className="text-xs leading-5 text-neutral-500"
              >
                JPEG, PNG, or WebP.
                Maximum 5 MiB. Images
                are validated and
                converted to a sanitized
                static WebP before they
                can be attached.
              </p>
            </div>

            <p
              id="profile-media-status"
              aria-live="polite"
              className="text-xs leading-5 text-neutral-600"
            >
              {
                getMediaStatusText(
                  mediaStatus,
                )
              }
            </p>

            <div className="flex flex-wrap gap-2">
              {selectedProfileAssetKey &&
              !mediaBusy ? (
                <button
                  type="button"
                  onClick={
                    handleRemoveMedia
                  }
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-100"
                >
                  Remove on save
                </button>
              ) : null}

              {mediaStatus === "ready" ? (
                <button
                  type="button"
                  onClick={() => {
                    void restoreAuthoritativeSavedMedia();
                  }}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-100"
                >
                  Discard new upload
                </button>
              ) : null}

              {mediaStatus ===
              "remove_pending" ? (
                <button
                  type="button"
                  onClick={() => {
                    void restoreAuthoritativeSavedMedia();
                  }}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:border-neutral-400 hover:bg-neutral-100"
                >
                  Restore saved media
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {mediaError ? (
          <p
            role="alert"
            className="text-sm leading-6 text-red-700"
          >
            {mediaError}
          </p>
        ) : null}

        {state.fieldErrors.profileMedia ? (
          <p
            role="alert"
            className="text-sm leading-6 text-red-700"
          >
            {
              state.fieldErrors
                .profileMedia
            }
          </p>
        ) : null}
      </fieldset>

      {state.message ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
        >
          {state.message}
        </div>
      ) : null}

      <SubmitButton
        isFrontier={isFrontier}
        mediaBusy={mediaBusy}
      />

      <p className="text-center text-xs leading-5 text-neutral-500">
        Continue saves acknowledged
        Identity Working. Uploading or
        processing a photo alone does
        not save or publish your public
        page.
      </p>
    </form>
  );
}