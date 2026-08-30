import { redirect } from "next/navigation";
import {
  type NextRequest,
  NextResponse,
} from "next/server";

import { createClient } from "@/lib/supabase/server";

function redirectToSignUpFailure(
  request: NextRequest,
) {
  const url = new URL("/signup", request.url);

  url.searchParams.set(
    "notice",
    "confirmation_failed",
  );

  const response = NextResponse.redirect(
    url,
    303,
  );

  response.headers.set(
    "Cache-Control",
    "no-store",
  );

  return response;
}

export async function GET(
  request: NextRequest,
) {
  const tokenHash =
    request.nextUrl.searchParams.get(
      "token_hash",
    );

  const type =
    request.nextUrl.searchParams.get(
      "type",
    );

  if (
    typeof tokenHash !== "string" ||
    tokenHash.length === 0 ||
    type !== "email"
  ) {
    return redirectToSignUpFailure(request);
  }

  const supabase = await createClient();

  const { error } =
    await supabase.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });

  if (error) {
    return redirectToSignUpFailure(request);
  }

  redirect("/auth/resolve");
}