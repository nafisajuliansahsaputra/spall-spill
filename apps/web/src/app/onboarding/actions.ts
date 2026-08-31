"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  handleInputSchema,
  primaryUseCaseSchema,
} from "@/lib/onboarding/validation";
import { createClient } from "@/lib/supabase/server";

import type {
  HandleActionState,
  PrimaryUseCaseActionState,
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

  const {
    data,
    error,
  } = await supabase
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

  const {
    data,
    error,
  } = await supabase
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