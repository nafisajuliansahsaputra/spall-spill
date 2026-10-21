import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readIdentityTextEditorCommandRequest } from "./identity-text-editor-body";
import { identityTextEditorRequestMetadata as metadata } from "./identity-text-editor-request";
import { createOwnerTextEditorCommands, type OwnerTextEditorCommandResult } from "./owner-text-editor-commands";

type Permit = Parameters<typeof readIdentityTextEditorCommandRequest>[2];
function httpStatus(result: OwnerTextEditorCommandResult): number {
  switch (result.status) {
    case "allocated": case "initialized": case "saved": return 200;
    case "unauthenticated": return 401;
    case "invalid_text_command": case "invalid_add_intent": case "invalid_initialization_intent": case "invalid_text_working": return 400;
    case "stale_write": case "already_initialized": case "revision_exhausted": case "position_exhausted": case "block_not_found": case "unsupported_block_kind": return 409;
    case "owner_missing": case "owner_not_eligible": case "onboarding_incomplete": case "restricted": case "suspended": return 403;
    default: return 503;
  }
}
function response(result: OwnerTextEditorCommandResult, status = httpStatus(result)): Response {
  let body = JSON.stringify(result);
  if (new TextEncoder().encode(body).byteLength > 128 * 1024) {
    body = JSON.stringify(result.status === "allocated" || result.status === "initialized" || result.status === "saved"
      ? { status: result.status, block_id: result.block_id, collection_revision: result.collection_revision, readback: { status: "unavailable" } }
      : { status: "unavailable" });
  }
  return new Response(body, { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store, max-age=0",
    Pragma: "no-cache", Expires: "0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  } });
}

/** Unmounted. Actual Next cookie context, distributed permit and transport safety are activation gates. */
export async function handleIdentityTextEditorCommandRequest(request: Request, trustedOrigin: string, permit: Permit): Promise<Response> {
  const deadline = performance.now() + 20000;
  let invoked = false, stopped = false;
  const failure = () => response({ status: invoked ? "outcome_unknown" : "unavailable" });
  let resolveStop!: (value: Response) => void;
  const stoppedResult = new Promise<Response>(resolve => { resolveStop = resolve; });
  const stop = () => { stopped = true; resolveStop(failure()); };
  const timer = setTimeout(stop, 20000);
  request.signal.addEventListener("abort", stop, { once: true });
  try {
    const originalMetadata = metadata(request);
    const valid = () => !stopped && !request.signal.aborted && performance.now() < deadline && metadata(request) === originalMetadata;
    return await Promise.race([
      (async (): Promise<Response> => {
        if (!valid()) return failure();
        const command = await readIdentityTextEditorCommandRequest(request, trustedOrigin, permit);
        if (!valid()) return failure();
        if (command === null) return response({ status: "unavailable" }, 403);
        const client = await createClient();
        if (!valid()) return failure();
        const commands = createOwnerTextEditorCommands(client);
        invoked = true;
        const result = await commands.execute(command);
        if (!valid()) return failure();
        const output = response(result);
        return valid() ? output : failure();
      })(),
      stoppedResult,
    ]);
  } catch { return failure(); }
  finally { stopped = true; clearTimeout(timer); request.signal.removeEventListener("abort", stop); }
}
