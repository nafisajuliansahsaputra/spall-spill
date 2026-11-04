import { NextResponse } from "next/server";
import { resolveCurrentOwnerDestination } from "@/lib/auth/resolved-destination";
import { sanitizeIntendedDestination } from "@/lib/auth/intended-destination";

export async function GET() {
  const destination = await resolveCurrentOwnerDestination();
  const safe = destination === "/login" || destination === "/onboarding"
    || (destination !== null && sanitizeIntendedDestination(destination) === destination);
  if (!safe || destination === null) {
    return new NextResponse("We couldn't safely resolve your account state. Please try again later.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // The browser resolves this against its origin; internal proxy URLs are not redirect authority.
  return new NextResponse(null, { status: 303, headers: { Location: destination, "Cache-Control": "no-store" } });
}
