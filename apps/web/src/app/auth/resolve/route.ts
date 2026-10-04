import { type NextRequest, NextResponse } from "next/server";
import { resolveCurrentOwnerDestination } from "@/lib/auth/resolved-destination";

export async function GET(request: NextRequest) {
  const destination = await resolveCurrentOwnerDestination();
  if (destination === null) {
    return new NextResponse("We couldn't safely resolve your account state. Please try again later.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
