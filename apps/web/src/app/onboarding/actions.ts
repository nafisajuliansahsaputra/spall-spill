"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  bioInputSchema,
  displayNameInputSchema,
  handleInputSchema,
  primaryUseCaseSchema,
  starterKeySchema,
} from "@/lib/onboarding/validation";
import {
  profileMediaAssetKeySchema,
} from "@/lib/profile-media/contracts";
import { createClient } from "@/lib/supabase/server";

import type {
  BasicIdentityActionState,
  HandleActionState,
  PrimaryUseCaseActionState,
  StarterCompositionActionState,
} from "./state";

const baseRevisionSchema = z.coerce
  .number()
  .int()
  .positive();

function getRpcStatus(
  value: unknown,
): string | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const status = (
    value as Record<string, unknown>
  ).status;

  return typeof status === "string"
    ? status
    : null;
}

function parseOptionalRevision(
  value: FormDataEntryValue | null,
):
  | {
      success: true;
      data: number | null;
    }
  | {
      success: false;
    } {
  if (value === null || value === "") {
    return {
      success: true,
      data: null,
    };
  }

  const parsed =
    baseRevisionSchema.safeParse(value);

  if (!parsed.success) {
    return {
      success: false,
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

function parseOptionalProfileAssetKey(
  value: FormDataEntryValue | null,
):
  | {
      success: true;
      data: string | null;
    }
  | {
      success: false;
    } {
  if (value === null || value === "") {
    return {
      success: true,
      data: null,
    };
  }

  if (typeof value !== "string") {
    return {
      success: false,
    };
  }

  const normalized =
    value.trim().toLowerCase();

  if (normalized.length === 0) {
    return {
      success: true,
      data: null,
    };
  }

  const parsed =
    profileMediaAssetKeySchema.safeParse(
      normalized,
    );

  if (!parsed.success) {
    return {
      success: false,
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
}

function resolveOwnerRoutingStatus(
  status: string | null,
): never | void {
  if (
    status === "unauthenticated" ||
    status === "owner_missing" ||
    status === "owner_not_eligible"
  ) {
    redirect("/auth/resolve");
  }
}

export async function claimHandleAction(
  _previousState: HandleActionState,
  formData: FormData,
): Promise<HandleActionState> {
  const rawHandle =
    formData.get("handle");

  const rawBaseRevision =
    formData.get("baseRevision");

  const handle =
    typeof rawHandle === "string"
      ? rawHandle
      : "";

  const parsedHandle =
    handleInputSchema.safeParse(handle);

  if (!parsedHandle.success) {
    return {
      status: "error",
      message:
        "Check your Handle and try again.",
      handle,
      fieldErrors: {
        handle:
          parsedHandle.error.issues[0]
            ?.message ??
          "Enter a valid Handle.",
      },
    };
  }

  const parsedRevision =
    baseRevisionSchema.safeParse(
      rawBaseRevision,
    );

  if (!parsedRevision.success) {
    return {
      status: "error",
      message:
        "Your onboarding state could not be verified. Reload the page and try again.",
      handle: parsedHandle.data,
      fieldErrors: {},
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("api")
    .rpc(
      "claim_current_owner_handle",
      {
        input_handle:
          parsedHandle.data,
        base_revision:
          parsedRevision.data,
      },
    );

  if (error) {
    return {
      status: "error",
      message:
        "We couldn't save your Handle right now. Your existing saved setup is unchanged.",
      handle: parsedHandle.data,
      fieldErrors: {},
    };
  }

  const status = getRpcStatus(data);

  resolveOwnerRoutingStatus(status);

  switch (status) {
    case "success":
      redirect("/onboarding");

    case "invalid_handle":
      return {
        status: "error",
        message:
          "Check your Handle and try again.",
        handle: parsedHandle.data,
        fieldErrors: {
          handle:
            "That Handle does not match the supported format.",
        },
      };

    case "reserved_handle":
      return {
        status: "error",
        message:
          "Choose a different Handle.",
        handle: parsedHandle.data,
        fieldErrors: {
          handle:
            "That Handle is reserved by Spall Spill.",
        },
      };

    case "handle_unavailable":
      return {
        status: "error",
        message:
          "Choose a different Handle.",
        handle: parsedHandle.data,
        fieldErrors: {
          handle:
            "That Handle is already unavailable.",
        },
      };

    case "stale_write":
      return {
        status: "error",
        message:
          "Your onboarding state changed in another tab or session. Reload this page before making another change.",
        handle: parsedHandle.data,
        fieldErrors: {},
      };

    default:
      return {
        status: "error",
        message:
          "We couldn't safely save your Handle. Reload the page and try again.",
        handle: parsedHandle.data,
        fieldErrors: {},
      };
  }
}

export async function setPrimaryUseCaseAction(
  _previousState: PrimaryUseCaseActionState,
  formData: FormData,
): Promise<PrimaryUseCaseActionState> {
  const rawPrimaryUseCase =
    formData.get("primaryUseCase");

  const rawBaseRevision =
    formData.get("baseRevision");

  const primaryUseCase =
    typeof rawPrimaryUseCase === "string"
      ? rawPrimaryUseCase
      : "";

  const parsedPrimaryUseCase =
    primaryUseCaseSchema.safeParse(
      primaryUseCase,
    );

  if (!parsedPrimaryUseCase.success) {
    return {
      status: "error",
      message:
        "Choose the option that best matches what you want to start with.",
      primaryUseCase,
      fieldErrors: {
        primaryUseCase:
          "Choose one of the available options.",
      },
    };
  }

  const parsedRevision =
    baseRevisionSchema.safeParse(
      rawBaseRevision,
    );

  if (!parsedRevision.success) {
    return {
      status: "error",
      message:
        "Your onboarding state could not be verified. Reload the page and try again.",
      primaryUseCase:
        parsedPrimaryUseCase.data,
      fieldErrors: {},
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("api")
    .rpc(
      "set_current_owner_primary_use_case",
      {
        input_primary_use_case:
          parsedPrimaryUseCase.data,
        base_revision:
          parsedRevision.data,
      },
    );

  if (error) {
    return {
      status: "error",
      message:
        "We couldn't save this choice right now. Your existing saved setup is unchanged.",
      primaryUseCase:
        parsedPrimaryUseCase.data,
      fieldErrors: {},
    };
  }

  const status = getRpcStatus(data);

  resolveOwnerRoutingStatus(status);

  switch (status) {
    case "success":
      redirect("/onboarding");

    case "invalid_primary_use_case":
      return {
        status: "error",
        message:
          "Choose the option that best matches what you want to start with.",
        primaryUseCase,
        fieldErrors: {
          primaryUseCase:
            "Choose one of the available options.",
        },
      };

    case "handle_required":
      return {
        status: "error",
        message:
          "Your Handle setup must be completed first. Reload this page to restore the correct step.",
        primaryUseCase:
          parsedPrimaryUseCase.data,
        fieldErrors: {},
      };

    case "stale_write":
      return {
        status: "error",
        message:
          "Your onboarding state changed in another tab or session. Reload this page before making another change.",
        primaryUseCase:
          parsedPrimaryUseCase.data,
        fieldErrors: {},
      };

    default:
      return {
        status: "error",
        message:
          "We couldn't safely save this choice. Reload the page and try again.",
        primaryUseCase:
          parsedPrimaryUseCase.data,
        fieldErrors: {},
      };
  }
}

export async function saveBasicIdentityAction(
  _previousState: BasicIdentityActionState,
  formData: FormData,
): Promise<BasicIdentityActionState> {
  const rawDisplayName =
    formData.get("displayName");

  const rawBio =
    formData.get("bio");

  const displayName =
    typeof rawDisplayName === "string"
      ? rawDisplayName
      : "";

  const bio =
    typeof rawBio === "string"
      ? rawBio
      : "";

  const parsedDisplayName =
    displayNameInputSchema.safeParse(
      displayName,
    );

  const parsedBio =
    bioInputSchema.safeParse(bio);

  const parsedProfileAssetKey =
    parseOptionalProfileAssetKey(
      formData.get(
        "profileAssetKey",
      ),
    );

  const fieldErrors: {
    displayName?: string;
    bio?: string;
    profileMedia?: string;
  } = {};

  if (!parsedDisplayName.success) {
    fieldErrors.displayName =
      parsedDisplayName.error.issues[0]
        ?.message ??
      "Enter a valid Display Name.";
  }

  if (!parsedBio.success) {
    fieldErrors.bio =
      parsedBio.error.issues[0]
        ?.message ??
      "Enter a valid Bio.";
  }

  if (!parsedProfileAssetKey.success) {
    fieldErrors.profileMedia =
      "The selected Profile Photo / Logo is invalid. Choose another image or reload the page.";
  }

  if (
    !parsedDisplayName.success ||
    !parsedBio.success ||
    !parsedProfileAssetKey.success
  ) {
    return {
      status: "error",
      message:
        "Check your Basic Identity and try again.",
      displayName,
      bio,
      profileAssetKey:
        parsedProfileAssetKey.success
          ? parsedProfileAssetKey.data
          : null,
      fieldErrors,
    };
  }

  const parsedIdentityRevision =
    parseOptionalRevision(
      formData.get(
        "baseIdentityRevision",
      ),
    );

  const parsedProgressRevision =
    baseRevisionSchema.safeParse(
      formData.get(
        "baseProgressRevision",
      ),
    );

  if (
    !parsedIdentityRevision.success ||
    !parsedProgressRevision.success
  ) {
    return {
      status: "error",
      message:
        "Your saved Working state could not be verified. Reload the page and try again.",
      displayName:
        parsedDisplayName.data,
      bio: parsedBio.data ?? "",
      profileAssetKey:
        parsedProfileAssetKey.data,
      fieldErrors: {},
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("api")
    .rpc(
      "save_current_owner_basic_identity",
      {
        input_display_name:
          parsedDisplayName.data,
        input_bio:
          parsedBio.data,
        input_profile_asset_key:
          parsedProfileAssetKey.data,
        base_identity_revision:
          parsedIdentityRevision.data,
        base_progress_revision:
          parsedProgressRevision.data,
      },
    );

  if (error) {
    return {
      status: "error",
      message:
        "We couldn't save your Basic Identity right now. Your last acknowledged Working state is unchanged.",
      displayName:
        parsedDisplayName.data,
      bio: parsedBio.data ?? "",
      profileAssetKey:
        parsedProfileAssetKey.data,
      fieldErrors: {},
    };
  }

  const status = getRpcStatus(data);

  resolveOwnerRoutingStatus(status);

  switch (status) {
    case "success":
      redirect("/onboarding");

    case "invalid_display_name":
      return {
        status: "error",
        message:
          "Check your Basic Identity and try again.",
        displayName,
        bio,
        profileAssetKey:
          parsedProfileAssetKey.data,
        fieldErrors: {
          displayName:
            "Enter a valid Display Name.",
        },
      };

    case "invalid_bio":
      return {
        status: "error",
        message:
          "Check your Basic Identity and try again.",
        displayName:
          parsedDisplayName.data,
        bio,
        profileAssetKey:
          parsedProfileAssetKey.data,
        fieldErrors: {
          bio:
            "Enter a valid Bio.",
        },
      };

    case "invalid_profile_asset":
      return {
        status: "error",
        message:
          "We couldn't safely attach that Profile Photo / Logo. Your last acknowledged Working media is unchanged.",
        displayName:
          parsedDisplayName.data,
        bio: parsedBio.data ?? "",
        profileAssetKey:
          parsedProfileAssetKey.data,
        fieldErrors: {
          profileMedia:
            "That media selection is no longer available. Choose another image or reload the page.",
        },
      };

    case "stale_write":
      return {
        status: "error",
        message:
          "Your Basic Identity changed in another tab or session. Reload the page before making another change.",
        displayName:
          parsedDisplayName.data,
        bio: parsedBio.data ?? "",
        profileAssetKey:
          parsedProfileAssetKey.data,
        fieldErrors: {},
      };

    case "progress_stale":
      return {
        status: "error",
        message:
          "Your onboarding progress changed in another tab or session. Reload the page before continuing.",
        displayName:
          parsedDisplayName.data,
        bio: parsedBio.data ?? "",
        profileAssetKey:
          parsedProfileAssetKey.data,
        fieldErrors: {},
      };

    case "step_not_available":
    case "prerequisite_missing":
      redirect("/onboarding");

    default:
      return {
        status: "error",
        message:
          "We couldn't safely save your Basic Identity. Reload the page and try again.",
        displayName:
          parsedDisplayName.data,
        bio: parsedBio.data ?? "",
        profileAssetKey:
          parsedProfileAssetKey.data,
        fieldErrors: {},
      };
  }
}

export async function saveStarterCompositionAction(
  _previousState:
    StarterCompositionActionState,
  formData: FormData,
): Promise<StarterCompositionActionState> {
  const rawStarterKey =
    formData.get("starterKey");

  const starterKey =
    typeof rawStarterKey === "string"
      ? rawStarterKey
      : "";

  const parsedStarterKey =
    starterKeySchema.safeParse(
      starterKey,
    );

  if (!parsedStarterKey.success) {
    return {
      status: "error",
      message:
        "Choose one of the available Starter Compositions.",
      starterKey,
      fieldErrors: {
        starterKey:
          "Choose one of the available Starter Compositions.",
      },
    };
  }

  const parsedLayoutRevision =
    parseOptionalRevision(
      formData.get(
        "baseLayoutRevision",
      ),
    );

  const parsedProgressRevision =
    baseRevisionSchema.safeParse(
      formData.get(
        "baseProgressRevision",
      ),
    );

  if (
    !parsedLayoutRevision.success ||
    !parsedProgressRevision.success
  ) {
    return {
      status: "error",
      message:
        "Your saved Working state could not be verified. Reload the page and try again.",
      starterKey:
        parsedStarterKey.data,
      fieldErrors: {},
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("api")
    .rpc(
      "save_current_owner_starter_composition",
      {
        input_starter_key:
          parsedStarterKey.data,
        base_layout_revision:
          parsedLayoutRevision.data,
        base_progress_revision:
          parsedProgressRevision.data,
      },
    );

  if (error) {
    return {
      status: "error",
      message:
        "We couldn't save your Starter Composition right now. Your last acknowledged Working layout is unchanged.",
      starterKey:
        parsedStarterKey.data,
      fieldErrors: {},
    };
  }

  const status = getRpcStatus(data);

  resolveOwnerRoutingStatus(status);

  switch (status) {
    case "success":
      redirect("/onboarding");

    case "invalid_starter":
      return {
        status: "error",
        message:
          "Choose one of the available Starter Compositions.",
        starterKey,
        fieldErrors: {
          starterKey:
            "Choose one of the available Starter Compositions.",
        },
      };

    case "stale_write":
      return {
        status: "error",
        message:
          "Your Starter Composition changed in another tab or session. Reload the page before making another change.",
        starterKey:
          parsedStarterKey.data,
        fieldErrors: {},
      };

    case "progress_stale":
      return {
        status: "error",
        message:
          "Your onboarding progress changed in another tab or session. Reload the page before continuing.",
        starterKey:
          parsedStarterKey.data,
        fieldErrors: {},
      };

    case "identity_required":
      return {
        status: "error",
        message:
          "Your saved Basic Identity could not be verified. Reload the page before continuing.",
        starterKey:
          parsedStarterKey.data,
        fieldErrors: {},
      };

    case "step_not_available":
      redirect("/onboarding");

    default:
      return {
        status: "error",
        message:
          "We couldn't safely save your Starter Composition. Reload the page and try again.",
        starterKey:
          parsedStarterKey.data,
        fieldErrors: {},
      };
  }
}
