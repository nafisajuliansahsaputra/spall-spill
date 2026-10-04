import type {
  NextRequest,
} from "next/server";

import {
  createContentSecurityPolicy,
  createRequestNonce,
} from "@/lib/security/content-security-policy";
import {
  updateSession,
} from "@/lib/supabase/proxy";

export async function proxy(
  request: NextRequest,
) {
  const nonce =
    createRequestNonce();

  const contentSecurityPolicy =
    createContentSecurityPolicy({
      nonce,
      isDevelopment:
        process.env.NODE_ENV !==
        "production",
      supabaseUrl:
        process.env
          .NEXT_PUBLIC_SUPABASE_URL,
      r2Endpoint:
        process.env.R2_S3_ENDPOINT,
      r2Bucket:
        process.env.R2_PROFILE_BUCKET,
    });

  const requestHeaders =
    new Headers(
      request.headers,
    );

  /*
   * Next.js reads the nonce from the incoming
   * CSP/request context and applies it to framework
   * scripts during dynamic rendering.
   */
  requestHeaders.set(
    "x-nonce",
    nonce,
  );

  requestHeaders.set(
    "Content-Security-Policy",
    contentSecurityPolicy,
  );

  const response =
    await updateSession(
      request,
      requestHeaders,
    );

  response.headers.set(
    "Content-Security-Policy",
    contentSecurityPolicy,
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};