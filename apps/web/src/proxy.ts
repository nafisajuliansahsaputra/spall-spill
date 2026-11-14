import type {
  NextRequest,
} from "next/server";
import { NextResponse } from "next/server";

import { isPublicIdentityPath, isPublicIdentityOpenPath, isPublicSpillPath } from "@/lib/public/identity-path";

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
  // Public image delivery has its own Published-only authorization and headers.
  // Viewer cookies never grant media access or require a session refresh.
  if (request.nextUrl.pathname.startsWith("/media/identity/") || request.nextUrl.pathname.startsWith("/media/product/")) return NextResponse.next();
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

  const publicIdentity = isPublicIdentityPath(request.nextUrl.pathname) || isPublicIdentityOpenPath(request.nextUrl.pathname) || isPublicSpillPath(request.nextUrl.pathname);
  const response = publicIdentity ? NextResponse.next({ request: { headers: requestHeaders } })
    : await updateSession(request, requestHeaders);
  if (publicIdentity) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", (isPublicIdentityPath(request.nextUrl.pathname)||isPublicSpillPath(request.nextUrl.pathname)) ? "same-origin" : "no-referrer");
  }

  response.headers.set(
    "Content-Security-Policy",
    isPublicIdentityOpenPath(request.nextUrl.pathname)
      ? `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
      : contentSecurityPolicy,
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
