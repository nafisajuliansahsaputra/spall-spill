import "server-only";
import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { parseExactSpillReferenceLocator } from "./exact-reference-locator";
import { readProductClickRequest, readNativeRedemptionRequest } from "./product-click-request";
import type { ResourceOpenAction } from "./resource-open-budget";

const redemption = z.object({ handle: publicHandleSchema,
  spill_reference: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
    .refine(token => Buffer.from(token, "base64url").toString("base64url") === token),
}).strict();
export type ResourceOpenRequestInput = { handle: string; reference: string } | z.infer<typeof redemption>;

/** Unmounted JSON-only boundary. Parsed input is not Published or stored authority. */
export async function readResourceOpenRequest(request: Request, origin: string, action: ResourceOpenAction,
  permit: (request: Request, action: ResourceOpenAction) => Promise<unknown>): Promise<ResourceOpenRequestInput | null> {
  const input = await readProductClickRequest(request, origin, action, selected => permit(request, selected));
  if (input === null || request.signal.aborted) return null;
  if (action === "issue") {
    const locator = parseExactSpillReferenceLocator(input);
    return locator === null ? null : { handle: locator.handle, reference: String(locator.spill_reference) };
  }
  const parsed = redemption.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/** Separate form redemption; JSON media and DTO policies remain unchanged. */
export async function readResourceOpenFormRequest(request: Request, origin: string,
  permit: (request: Request, action: ResourceOpenAction) => Promise<unknown>): Promise<z.infer<typeof redemption> | null> {
  const input = await readNativeRedemptionRequest(request, origin, action => permit(request, action), text => {
    const pairs = text.split("&");
    if (pairs.length !== 3) throw new Error("unavailable");
    const values = new Map<string, string>();
    const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, " "));
    for (const pair of pairs) {
      const parts = pair.split("=");
      if (parts.length !== 2) throw new Error("unavailable");
      const key = decode(parts[0]!); const value = decode(parts[1]!);
      if (!["handle", "spill_reference", "token"].includes(key) || values.has(key) || !value) throw new Error("unavailable");
      values.set(key, value);
    }
    const reference = values.get("spill_reference")!;
    if (!/^[1-9][0-9]{0,15}$/.test(reference) || !Number.isSafeInteger(Number(reference))) throw new Error("unavailable");
    return { handle: values.get("handle"), spill_reference: Number(reference), token: values.get("token") };
  });
  if (input === null || request.signal.aborted) return null;
  const parsed = redemption.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export { productClickNoStoreHeaders as resourceOpenNoStoreHeaders,
  unavailableProductClickResponse as unavailableResourceOpenResponse } from "./product-click-request";
