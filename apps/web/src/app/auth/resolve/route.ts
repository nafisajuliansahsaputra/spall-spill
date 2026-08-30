import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  clearIntendedDestinationCookie,
  consumeIntendedDestinationCookie,
} from "@/lib/auth/intended-destination-cookie";
import {
  OwnerStateResolutionError,
  resolveCurrentOwnerState,
} from "@/lib/auth/owner-state";

function redirectInternal(
  request: NextRequest,
  pathname: string,
) {
  const response = NextResponse.redirect(
    new URL(pathname, request.url),
    303,
  );

  response.headers.set(
    "Cache-Control",
    "no-store",
  );

  return response;
}

function accountStateFailureResponse() {
  return new NextResponse(
    "We couldn't safely resolve your account state. Please try again later.",
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          "text/plain; charset=utf-8",
      },
    },
  );
}

export async function GET(
  request: NextRequest,
) {
  let resolution;

  try {
    resolution =
      await resolveCurrentOwnerState();
  } catch (error) {
    if (
      error instanceof
      OwnerStateResolutionError
    ) {
      return accountStateFailureResponse();
    }

    return accountStateFailureResponse();
  }

  switch (resolution.status) {
    case "unauthenticated":
      /*
       * Preserve any still-valid intended
       * destination so A02 Login can restore
       * it after successful authentication.
       */
      return redirectInternal(
        request,
        "/login",
      );

    case "owner_missing":
      await clearIntendedDestinationCookie();

      return accountStateFailureResponse();

    case "restricted":
    case "suspended":
      await clearIntendedDestinationCookie();

      return redirectInternal(
        request,
        "/dashboard/account-status",
      );

    case "onboarding_incomplete":
      await clearIntendedDestinationCookie();

      return redirectInternal(
        request,
        "/onboarding",
      );

    case "active": {
      const intendedDestination =
        await consumeIntendedDestinationCookie();

      return redirectInternal(
        request,
        intendedDestination ?? "/dashboard",
      );
    }
  }
}