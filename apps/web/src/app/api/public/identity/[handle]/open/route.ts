import { createIdentityConnectionPost } from "@/lib/public/identity-open-http";
import { openPublicIdentityConnection } from "@/lib/public/identity-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  return createIdentityConnectionPost(process.env.SPALL_PUBLIC_ORIGIN, openPublicIdentityConnection)(request, (await params).handle);
}
