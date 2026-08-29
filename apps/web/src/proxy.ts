import type { NextRequest } from "next/server";

import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  // Only routes that currently participate in authentication/session state run
  // the refresh boundary. Public/cacheable surfaces stay independent until a
  // locked product requirement says they need authenticated context.
  matcher: [
    "/signup",
    "/login",
    "/recovery",
    "/onboarding/:path*",
    "/dashboard/:path*",
    "/auth/:path*",
  ],
};
