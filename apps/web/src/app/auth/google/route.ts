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

function redirectToLoginFailure(
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

/*
 * OAuth initiation is a top-level navigation,
 * not a form submission.
 *
 * Keeping this route on GET lets CSP retain the
 * strict `form-action 'self'` boundary while the
 * browser may follow the resulting OAuth redirect.
 */
export async function GET(
  request: NextRequest,
) {
  const supabase = await createClient();

  const callbackUrl = new URL(
    "/auth/callback",
    request.url,
  );

  callbackUrl.search = "";
  callbackUrl.hash = "";

  const { data, error } =
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

  if (error || !data.url) {
    return redirectToLoginFailure(request);
  }

  return applyNoStoreHeaders(
    NextResponse.redirect(data.url, 303),
  );
}