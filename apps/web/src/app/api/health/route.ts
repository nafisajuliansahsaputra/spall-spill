import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const response = NextResponse.json(
    {
      ok: true,
      service: "spall-spill-web",
      stage: "foundation",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );

  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
