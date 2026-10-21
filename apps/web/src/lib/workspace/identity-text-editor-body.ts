import "server-only";
import { identityTextEditorCommandSchema, type IdentityTextEditorCommand } from "./identity-text-editor-command";
import { identityTextEditorMaximumBodyBytes as maximum, isIdentityTextEditorRequestAdmitted } from "./identity-text-editor-request";

export const identityTextEditorMaximumBodyReads = 32769;
const policyHeaders = ["origin", "host", "content-type", "content-length", "content-encoding", "transfer-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest"] as const;
const metadata = (request: Request) => JSON.stringify(policyHeaders.map(name => request.headers.get(name)));

type Permit = (action: "identity_text_command", signal: AbortSignal) => Promise<unknown>;

/** Unmounted transport only; permit must be a trusted distributed server adapter before activation. */
export async function readIdentityTextEditorCommandRequest(request: Request, trustedOrigin: string, permit: Permit): Promise<IdentityTextEditorCommand | null> {
  if (!isIdentityTextEditorRequestAdmitted(request, trustedOrigin)) return null;
  const initialMetadata = metadata(request), length = request.headers.get("content-length");
  const deadline = performance.now() + 5000, controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let stopped = false, completed = false;
  let resolveStop!: (value: null) => void;
  const stoppedResult = new Promise<null>(resolve => { resolveStop = resolve; });
  const cancelReader = () => {
    const owned = reader; reader = undefined;
    if (owned) void owned.cancel().catch(() => undefined).finally(() => {
      try { owned.releaseLock(); } catch { /* Ignored source cancellation cannot delay the outward result. */ }
    });
  };
  const stop = () => { stopped = true; controller.abort(); resolveStop(null); cancelReader(); };
  const expired = () => stopped || request.signal.aborted || performance.now() >= deadline;
  const valid = () => !expired() && metadata(request) === initialMetadata;
  const timer = setTimeout(stop, 5000);
  request.signal.addEventListener("abort", stop, { once: true });
  try {
    return await Promise.race([
      (async (): Promise<IdentityTextEditorCommand | null> => {
        if (!valid()) return null;
        const permitted = await permit("identity_text_command", controller.signal);
        if (!valid() || permitted !== true || !isIdentityTextEditorRequestAdmitted(request, trustedOrigin)) return null;
        const owned = request.body!.getReader(); reader = owned;
        const chunks: Uint8Array[] = []; let size = 0, reads = 0;
        while (true) {
          if (!valid() || ++reads > identityTextEditorMaximumBodyReads) return null;
          const { value, done } = await owned.read();
          if (!valid()) return null;
          if (done) break;
          if (!(value instanceof Uint8Array) || value.byteLength > maximum - size) return null;
          size += value.byteLength;
          if (value.byteLength) chunks.push(new Uint8Array(value));
        }
        if (!valid() || (length !== null && Number(length) !== size)) return null;
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        const parsed = identityTextEditorCommandSchema.safeParse(JSON.parse(text) as unknown);
        if (!valid() || !parsed.success) return null;
        owned.releaseLock(); reader = undefined; completed = true;
        return parsed.data;
      })(),
      stoppedResult,
    ]);
  } catch { return null; }
  finally {
    clearTimeout(timer); request.signal.removeEventListener("abort", stop);
    if (!completed) { stopped = true; controller.abort(); cancelReader(); }
  }
}
