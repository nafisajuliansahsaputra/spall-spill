import { readPublishedIdentityMedia } from "@/lib/public/identity-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const bytes = await readPublishedIdentityMedia((await params).handle);
  const headers = {
    "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Accept-Ranges": "none",
  };
  return bytes ? new Response(new Uint8Array(bytes), { status: 200, headers: {
    ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.byteLength),
  } }) : new Response("Unavailable", { status: 404, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}
