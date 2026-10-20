import "server-only";

export const identityTextEditorMaximumBodyBytes = 262144;

/** Metadata only. trustedOrigin must come from server configuration, never request headers. */
export function isIdentityTextEditorRequestAdmitted(request: Request, trustedOrigin: string): boolean {
  try {
    const origin = new URL(trustedOrigin), url = new URL(request.url);
    const headers = request.headers;
    const site = headers.get("sec-fetch-site"), mode = headers.get("sec-fetch-mode");
    const destination = headers.get("sec-fetch-dest"), encoding = headers.get("content-encoding");
    const length = headers.get("content-length");
    return origin.protocol === "https:" && origin.origin === trustedOrigin && !origin.username && !origin.password
      && request.method === "POST" && !request.signal.aborted && !request.bodyUsed
      && request.body !== null && !request.body.locked
      && url.origin === trustedOrigin && !url.username && !url.password
      && !request.url.includes("?") && !request.url.includes("#")
      && headers.get("origin") === trustedOrigin && headers.get("host") === origin.host
      && /^application\/json(?:;\s*charset=utf-8)?$/i.test(headers.get("content-type") ?? "")
      && (encoding === null || encoding === "identity") && headers.get("transfer-encoding") === null
      && (site === null || site === "same-origin")
      && (mode === null || mode === "cors" || mode === "same-origin")
      && (destination === null || destination === "" || destination === "empty")
      && (length === null || (/^(0|[1-9][0-9]{0,5})$/.test(length) && Number(length) <= identityTextEditorMaximumBodyBytes));
  } catch { return false; }
}
