import "server-only";
import { identityContactEditorCommandSchema, type IdentityContactEditorCommand } from "./identity-contact-editor-command";
import { identityContactEditorMaximumBodyBytes as maximum, isIdentityContactEditorRequestAdmitted, identityContactEditorRequestMetadata as metadata } from "./identity-contact-editor-request";

export const identityContactEditorMaximumBodyReads = 32769;
type Permit = (action: "identity_contact_command", signal: AbortSignal) => Promise<unknown>;

/** Unmounted transport only; permit must be a trusted distributed server adapter before activation. */
export async function readIdentityContactEditorCommandRequest(request: Request, trustedOrigin: string, permit: Permit): Promise<IdentityContactEditorCommand | null> {
  if (!isIdentityContactEditorRequestAdmitted(request, trustedOrigin)) return null;
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
      (async (): Promise<IdentityContactEditorCommand | null> => {
        if (!valid()) return null;
        const permitted = await permit("identity_contact_command", controller.signal);
        if (!valid() || permitted !== true || !isIdentityContactEditorRequestAdmitted(request, trustedOrigin)) return null;
        const owned = request.body!.getReader(); reader = owned;
        const chunks: Uint8Array[] = []; let size = 0, reads = 0;
        while (true) {
          if (!valid() || ++reads > identityContactEditorMaximumBodyReads) return null;
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
        const parsed = identityContactEditorCommandSchema.safeParse(JSON.parse(text) as unknown);
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
