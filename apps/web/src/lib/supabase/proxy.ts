import { createServerClient } from "@supabase/ssr";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  getIntendedDestinationCookieOptions,
  INTENDED_DESTINATION_COOKIE_NAME,
  sanitizeIntendedDestination,
} from "@/lib/auth/intended-destination";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

function isProtectedOwnerPathname(
  pathname: string,
): boolean {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/")
  );
}

function copySupabaseSessionState(
  source: NextResponse,
  target: NextResponse,
  authHeaders: Headers,
): void {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });

  authHeaders.forEach((value, name) => {
    target.headers.set(name, value);
  });
}

function applyIntendedDestination(
  response: NextResponse,
  pathname: string,
): void {
  const destination =
    sanitizeIntendedDestination(pathname);

  if (destination === null) {
    response.cookies.set(
      INTENDED_DESTINATION_COOKIE_NAME,
      "",
      {
        ...getIntendedDestinationCookieOptions(),
        maxAge: 0,
      },
    );

    return;
  }

  response.cookies.set(
    INTENDED_DESTINATION_COOKIE_NAME,
    destination,
    getIntendedDestinationCookieOptions(),
  );
}

export async function updateSession(
  request: NextRequest,
  forwardedRequestHeaders: Headers =
    new Headers(request.headers),
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({
    request: {
      headers:
        forwardedRequestHeaders,
    },
  });

  const authResponseHeaders = new Headers();

  const {
    supabaseUrl,
    supabasePublishableKey,
  } = getSupabasePublicEnv();

  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(
            ({ name, value }) => {
              request.cookies.set(
                name,
                value,
              );

              forwardedRequestHeaders.set(
                "cookie",
                request.cookies.toString(),
              );
            },
          );

          supabaseResponse =
            NextResponse.next({
              request: {
                headers:
                  forwardedRequestHeaders,
              },
            });

          cookiesToSet.forEach(
            ({
              name,
              value,
              options,
            }) => {
              supabaseResponse.cookies.set(
                name,
                value,
                options,
              );
            },
          );

          Object.entries(headers).forEach(
            ([name, value]) => {
              authResponseHeaders.set(
                name,
                value,
              );

              supabaseResponse.headers.set(
                name,
                value,
              );
            },
          );
        },
      },
    },
  );

  /*
   * Keep this call immediately after client creation.
   *
   * getClaims() validates the authentication
   * principal. Protected routing never trusts
   * getSession() as identity proof.
   */
  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const authUserId =
    claimsData?.claims?.sub;

  const hasVerifiedPrincipal =
    !claimsError &&
    typeof authUserId === "string" &&
    authUserId.length > 0;

  if (
    !hasVerifiedPrincipal &&
    isProtectedOwnerPathname(
      request.nextUrl.pathname,
    )
  ) {
    const loginUrl =
      request.nextUrl.clone();

    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.hash = "";

    const redirectResponse =
      NextResponse.redirect(
        loginUrl,
        307,
      );

    copySupabaseSessionState(
      supabaseResponse,
      redirectResponse,
      authResponseHeaders,
    );

    applyIntendedDestination(
      redirectResponse,
      request.nextUrl.pathname,
    );

    redirectResponse.headers.set(
      "Cache-Control",
      "private, no-store",
    );

    return redirectResponse;
  }

  return supabaseResponse;
}