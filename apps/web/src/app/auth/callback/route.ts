import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

function applyNoStoreHeaders(
  response: NextResponse,
): NextResponse {
  response.headers.set(
    "Cache-Control",
    "private, no-store",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}

function redirectInternal(
  request: NextRequest,
  pathname: string,
): NextResponse {
  const url = new URL(pathname, request.url);

  url.search = "";
  url.hash = "";

  return applyNoStoreHeaders(
    NextResponse.redirect(url, 303),
  );
}

function redirectToOAuthFailure(
  request: NextRequest,
): NextResponse {
  const url = new URL("/login", request.url);

  url.searchParams.set(
    "notice",
    "oauth_failed",
  );

  return applyNoStoreHeaders(
    NextResponse.redirect(url, 303),
  );
}

export async function GET(
  request: NextRequest,
) {
  const code =
    request.nextUrl.searchParams.get("code");

  if (
    typeof code !== "string" ||
    code.length === 0
  ) {
    return redirectToOAuthFailure(request);
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.exchangeCodeForSession(
      code,
    );

  if (error) {
    return redirectToOAuthFailure(request);
  }

  return redirectInternal(
    request,
    "/auth/resolve",
  );
}