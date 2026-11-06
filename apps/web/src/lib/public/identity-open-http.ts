import "server-only";
import { publicIdentityOrigin } from "./identity-origin";
export { publicIdentityOrigin } from "./identity-origin";
import { randomBytes } from "node:crypto";
import { renderIdentityNavigationDocument } from "./identity-navigation-document";
import { identityBindingSchema } from "./identity-contract";
import { publicHandleSchema } from "./locators";
import { normalizeExternalDestination } from "@spall-spill/external-destination-policy";
export const publicIdentityHeaders = {
  "Cache-Control": "private, no-store, max-age=0", "CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
};
export function createIdentityConnectionPost(origin: string | undefined,
  open: (handle: string, binding: string) => Promise<string | null>) {
  return async (request: Request, handle: unknown): Promise<Response> => {
    const denied = () => new Response("This destination is unavailable. Go back to the Identity page and try again.", {
      status: 403, headers: { ...publicIdentityHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
    const locator = publicHandleSchema.safeParse(handle);
    const expected = publicIdentityOrigin(origin);
    const length = request.headers.get("content-length");
    if (!locator.success || !expected || request.method !== "POST" || request.signal.aborted
      || request.headers.get("origin") !== expected
      || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")
      || !/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")
      || (length !== null && (!/^(0|[1-9][0-9]{0,2})$/.test(length) || Number(length) > 512))
      || !request.body) return denied();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reader = request.body.getReader(); let finished = false;
    try {
      const read = async () => {
        const chunks: Uint8Array[] = []; let size = 0; let reads = 0;
        while (true) {
          if (request.signal.aborted || ++reads > 513) return null;
          const part = await reader.read(); if (part.done) { finished = true; break; }
          if (part.value.byteLength > 512 - size) return null;
          size += part.value.byteLength; chunks.push(new Uint8Array(part.value));
        }
        if (request.signal.aborted || (length !== null && Number(length) !== size)) return null;
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      };
      const body = await Promise.race([read(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1000); })]);
      if (body === null || request.signal.aborted) return denied();
      const form = new URLSearchParams(body);
      if (Array.from(form.keys()).length !== 1 || !form.has("binding")) return denied();
      const binding = identityBindingSchema.safeParse(form.get("binding"));
      if (!binding.success) return denied();
      const destination = await open(locator.data, binding.data);
      if (request.signal.aborted || destination === null) return denied();
      const safe = normalizeExternalDestination(destination);
      if (safe.normalizedUrl !== destination) return denied();
      // A native form303 to an external URL is blocked by form-action self in
      // Chromium. Commit a separate nonce-protected document before navigation;
      // keep the original page policy strict and never accept a caller URL.
      // Actual Next Proxy overwrites x-nonce on every request and owns the final
      // response CSP. Direct isolated boundary calls generate their own nonce.
      const incomingNonce = request.headers.get("x-nonce");
      const nonce = incomingNonce && /^[A-Za-z0-9+/]{24}$/.test(incomingNonce)
        ? incomingNonce : randomBytes(18).toString("base64");
      const document = renderIdentityNavigationDocument(destination, nonce);
      return new Response(document, { status: 200, headers: { ...publicIdentityHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
      } });
    } catch { return denied(); }
    finally {
      clearTimeout(timer);
      if (finished) reader.releaseLock();
      else void reader.cancel().catch(() => {}).finally(() => { try { reader.releaseLock(); } catch { /* no denial delay */ } });
    }
  };
}
