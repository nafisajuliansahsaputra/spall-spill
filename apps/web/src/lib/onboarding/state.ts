import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import {
  CANONICAL_HANDLE_PATTERN,
  onboardingStepSchema,
  primaryUseCaseSchema,
  starterKeySchema,
} from "./validation";

const canonicalHandleOutputSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(CANONICAL_HANDLE_PATTERN);

const successPayloadSchema = z
  .object({
    status: z.literal("success"),
    current_step: onboardingStepSchema,
    current_handle:
      canonicalHandleOutputSchema.nullable(),
    primary_use_case:
      primaryUseCaseSchema.nullable(),
    revision: z
      .number()
      .int()
      .positive(),
  })
  .strict();

const statusOnlyPayloadSchema = z
  .object({
    status: z.enum([
      "unauthenticated",
      "owner_missing",
      "owner_unavailable",
      "onboarding_complete",
      "progress_missing",
    ]),
  })
  .strict();

const onboardingPayloadSchema = z.union([
  successPayloadSchema,
  statusOnlyPayloadSchema,
]);

const identityWorkingSchema = z
  .object({
    display_name: z.string(),
    bio: z.string().nullable(),
    profile_asset_key:
      z.string().nullable(),
    revision: z
      .number()
      .int()
      .positive(),
  })
  .strict();

const basicIdentitySuccessPayloadSchema =
  z
    .object({
      status: z.literal("success"),
      identity_working:
        identityWorkingSchema.nullable(),
    })
    .strict();

const basicIdentityPayloadSchema = z.union([
  basicIdentitySuccessPayloadSchema,
  statusOnlyPayloadSchema,
]);

const starterCompositionWorkingSchema =
  z
    .object({
      starter_key: starterKeySchema,
      revision: z
        .number()
        .int()
        .positive(),
    })
    .strict();

const starterCompositionSuccessPayloadSchema =
  z
    .object({
      status: z.literal("success"),
      layout_working:
        starterCompositionWorkingSchema.nullable(),
    })
    .strict();

const starterCompositionPayloadSchema =
  z.union([
    starterCompositionSuccessPayloadSchema,
    statusOnlyPayloadSchema,
  ]);

export type OnboardingStateResolution =
  | {
      status: "success";
      currentStep:
        z.infer<typeof onboardingStepSchema>;
      currentHandle: string | null;
      primaryUseCase:
        z.infer<
          typeof primaryUseCaseSchema
        > | null;
      revision: number;
    }
  | {
      status:
        | "unauthenticated"
        | "owner_missing"
        | "owner_unavailable"
        | "onboarding_complete"
        | "progress_missing";
    };

export type BasicIdentityWorking = {
  displayName: string;
  bio: string | null;
  profileAssetKey: string | null;
  revision: number;
};

export type BasicIdentityStateResolution =
  | {
      status: "success";
      identityWorking:
        BasicIdentityWorking | null;
    }
  | {
      status:
        | "unauthenticated"
        | "owner_missing"
        | "owner_unavailable"
        | "onboarding_complete"
        | "progress_missing";
    };

export type StarterCompositionWorking = {
  starterKey:
    z.infer<typeof starterKeySchema>;
  revision: number;
};

export type StarterCompositionStateResolution =
  | {
      status: "success";
      layoutWorking:
        StarterCompositionWorking | null;
    }
  | {
      status:
        | "unauthenticated"
        | "owner_missing"
        | "owner_unavailable"
        | "onboarding_complete"
        | "progress_missing";
    };

export class OnboardingStateResolutionError extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "OnboardingStateResolutionError";
  }
}

async function verifyCurrentAuthUser(): Promise<
  "authenticated" | "unauthenticated"
> {
  const supabase = await createClient();

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const authUserId =
    claimsData?.claims?.sub;

  if (
    claimsError ||
    typeof authUserId !== "string" ||
    authUserId.length === 0
  ) {
    return "unauthenticated";
  }

  return "authenticated";
}

export async function resolveCurrentOnboardingState(): Promise<OnboardingStateResolution> {
  const authStatus =
    await verifyCurrentAuthUser();

  if (authStatus === "unauthenticated") {
    return {
      status: "unauthenticated",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("api")
    .rpc(
      "resolve_current_onboarding_state",
    );

  if (error) {
    throw new OnboardingStateResolutionError(
      "Onboarding-state resolver request failed.",
    );
  }

  const parsed =
    onboardingPayloadSchema.safeParse(
      data,
    );

  if (!parsed.success) {
    throw new OnboardingStateResolutionError(
      "Onboarding-state resolver returned an invalid payload.",
    );
  }

  if (
    parsed.data.status ===
    "unauthenticated"
  ) {
    throw new OnboardingStateResolutionError(
      "Verified authentication and database onboarding state are inconsistent.",
    );
  }

  if (parsed.data.status !== "success") {
    return {
      status: parsed.data.status,
    };
  }

  return {
    status: "success",
    currentStep:
      parsed.data.current_step,
    currentHandle:
      parsed.data.current_handle,
    primaryUseCase:
      parsed.data.primary_use_case,
    revision: parsed.data.revision,
  };
}

export async function resolveCurrentBasicIdentityState(): Promise<BasicIdentityStateResolution> {
  const authStatus =
    await verifyCurrentAuthUser();

  if (authStatus === "unauthenticated") {
    return {
      status: "unauthenticated",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("api")
    .rpc(
      "resolve_current_basic_identity_state",
    );

  if (error) {
    throw new OnboardingStateResolutionError(
      "Basic Identity resolver request failed.",
    );
  }

  const parsed =
    basicIdentityPayloadSchema.safeParse(
      data,
    );

  if (!parsed.success) {
    throw new OnboardingStateResolutionError(
      "Basic Identity resolver returned an invalid payload.",
    );
  }

  if (
    parsed.data.status ===
    "unauthenticated"
  ) {
    throw new OnboardingStateResolutionError(
      "Verified authentication and database Basic Identity state are inconsistent.",
    );
  }

  if (parsed.data.status !== "success") {
    return {
      status: parsed.data.status,
    };
  }

  if (!parsed.data.identity_working) {
    return {
      status: "success",
      identityWorking: null,
    };
  }

  return {
    status: "success",
    identityWorking: {
      displayName:
        parsed.data.identity_working
          .display_name,
      bio:
        parsed.data.identity_working.bio,
      profileAssetKey:
        parsed.data.identity_working
          .profile_asset_key,
      revision:
        parsed.data.identity_working
          .revision,
    },
  };
}

export async function resolveCurrentStarterCompositionState(): Promise<StarterCompositionStateResolution> {
  const authStatus =
    await verifyCurrentAuthUser();

  if (authStatus === "unauthenticated") {
    return {
      status: "unauthenticated",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema("api")
    .rpc(
      "resolve_current_starter_composition_state",
    );

  if (error) {
    throw new OnboardingStateResolutionError(
      "Starter Composition resolver request failed.",
    );
  }

  const parsed =
    starterCompositionPayloadSchema.safeParse(
      data,
    );

  if (!parsed.success) {
    throw new OnboardingStateResolutionError(
      "Starter Composition resolver returned an invalid payload.",
    );
  }

  if (
    parsed.data.status ===
    "unauthenticated"
  ) {
    throw new OnboardingStateResolutionError(
      "Verified authentication and database Starter Composition state are inconsistent.",
    );
  }

  if (parsed.data.status !== "success") {
    return {
      status: parsed.data.status,
    };
  }

  if (!parsed.data.layout_working) {
    return {
      status: "success",
      layoutWorking: null,
    };
  }

  return {
    status: "success",
    layoutWorking: {
      starterKey:
        parsed.data.layout_working
          .starter_key,
      revision:
        parsed.data.layout_working
          .revision,
    },
  };
}
