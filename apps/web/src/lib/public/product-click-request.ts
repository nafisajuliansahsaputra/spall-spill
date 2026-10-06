import "server-only";

export type ProductClickAction = "issue" | "redeem";
const maximum = 4096;
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("unavailable")), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

/** Unmounted primitive. Permit must use a trusted distributed adapter before enabling. */
export async function readProductClickRequest(request: Request, trustedOrigin: string, action: ProductClickAction,
  permit: (action: ProductClickAction) => Promise<unknown>): Promise<unknown | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let completed = false;
  try {
    const origin = new URL(trustedOrigin);
    const url = new URL(request.url);
    const host = request.headers.get("host");
    const site = request.headers.get("sec-fetch-site");
    const encoding = request.headers.get("content-encoding");
    const length = request.headers.get("content-length");
    if (origin.protocol !== "https:" || origin.origin !== trustedOrigin || origin.username || origin.password
      || request.method !== "POST" || !["issue", "redeem"].includes(action) || request.signal.aborted
      || request.headers.get("origin") !== trustedOrigin || url.origin !== trustedOrigin
      || url.username || url.password || url.search || url.hash
      || (host !== null && host !== origin.host) || (site !== null && site !== "same-origin")
      || (encoding !== null && encoding !== "identity")
      || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers.get("content-type") ?? "")
      || (length !== null && (!/^(0|[1-9][0-9]{0,3})$/.test(length) || Number(length) > maximum))) return null;
    if (await bounded(permit(action)) !== true || request.signal.aborted || request.body === null) return null;
    reader = request.body.getReader();
    const body = await bounded((async () => {
      const chunks: Uint8Array[] = []; let size = 0; let reads = 0;
      while (true) {
        if (request.signal.aborted || ++reads > maximum + 1) throw new Error("unavailable");
        const { value, done } = await reader!.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) throw new Error("unavailable");
        chunks.push(value.slice());
      }
      if (request.signal.aborted || (length !== null && Number(length) !== size)) throw new Error("unavailable");
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    })());
    completed = true;
    reader.releaseLock();
    return body ?? null;
  } catch { return null; }
  finally {
    if (reader && !completed) void reader.cancel().then(() => reader!.releaseLock()).catch(() => undefined);
  }
}

export function productClickNoStoreHeaders(): Headers {
  return new Headers({ "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Expires: "0",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" });
}
export function unavailableProductClickResponse(): Response {
  const headers = productClickNoStoreHeaders(); headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify({ status: "unavailable" }), { status: 403, headers });
}
