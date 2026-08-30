import { createClient } from "@/lib/supabase/server";

export type OwnerStateResolution =
  | {
      status: "unauthenticated";
    }
  | {
      status: "owner_missing";
    }
  | {
      status: "restricted";
      ownerId: string;
    }
  | {
      status: "suspended";
      ownerId: string;
    }
  | {
      status: "onboarding_incomplete";
      ownerId: string;
    }
  | {
      status: "active";
      ownerId: string;
    };

export class OwnerStateResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerStateResolutionError";
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UUID_PATTERN.test(value)
  );
}

function invalidPayload(): never {
  throw new OwnerStateResolutionError(
    "Owner-state resolver returned an invalid payload.",
  );
}

function parseOwnerStatePayload(
  value: unknown,
): OwnerStateResolution {
  if (!isRecord(value)) {
    return invalidPayload();
  }

  const status = value.status;
  const ownerId = value.owner_id;
  const accountState = value.account_state;
  const onboardingCompleted =
    value.onboarding_completed;

  switch (status) {
    case "unauthenticated": {
      if (
        ownerId !== null ||
        accountState !== null ||
        onboardingCompleted !== null
      ) {
        return invalidPayload();
      }

      return {
        status: "unauthenticated",
      };
    }

    case "owner_missing": {
      if (
        ownerId !== null ||
        accountState !== null ||
        onboardingCompleted !== null
      ) {
        return invalidPayload();
      }

      return {
        status: "owner_missing",
      };
    }

    case "restricted": {
      if (
        !isUuid(ownerId) ||
        accountState !== "restricted" ||
        typeof onboardingCompleted !== "boolean"
      ) {
        return invalidPayload();
      }

      return {
        status: "restricted",
        ownerId,
      };
    }

    case "suspended": {
      if (
        !isUuid(ownerId) ||
        accountState !== "suspended" ||
        typeof onboardingCompleted !== "boolean"
      ) {
        return invalidPayload();
      }

      return {
        status: "suspended",
        ownerId,
      };
    }

    case "onboarding_incomplete": {
      if (
        !isUuid(ownerId) ||
        accountState !== "active" ||
        onboardingCompleted !== false
      ) {
        return invalidPayload();
      }

      return {
        status: "onboarding_incomplete",
        ownerId,
      };
    }

    case "active": {
      if (
        !isUuid(ownerId) ||
        accountState !== "active" ||
        onboardingCompleted !== true
      ) {
        return invalidPayload();
      }

      return {
        status: "active",
        ownerId,
      };
    }

    default:
      return invalidPayload();
  }
}

export async function resolveCurrentOwnerState(): Promise<OwnerStateResolution> {
  const supabase = await createClient();

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const authUserId = claimsData?.claims?.sub;

  if (
    claimsError ||
    typeof authUserId !== "string" ||
    authUserId.length === 0
  ) {
    return {
      status: "unauthenticated",
    };
  }

  const {
    data,
    error,
  } = await supabase
    .schema("api")
    .rpc("resolve_current_owner_state");

  if (error) {
    throw new OwnerStateResolutionError(
      "Owner-state resolver request failed.",
    );
  }

  const resolution = parseOwnerStatePayload(data);

  if (resolution.status === "unauthenticated") {
    throw new OwnerStateResolutionError(
      "Verified authentication and database Owner state are inconsistent.",
    );
  }

  return resolution;
}
