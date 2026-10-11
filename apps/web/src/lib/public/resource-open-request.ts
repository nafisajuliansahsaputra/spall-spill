import "server-only";
import { z } from "zod";
import { publicHandleSchema } from "./locators";
import { parseExactSpillReferenceLocator } from "./exact-reference-locator";
import { readProductClickRequest } from "./product-click-request";
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

export { productClickNoStoreHeaders as resourceOpenNoStoreHeaders,
  unavailableProductClickResponse as unavailableResourceOpenResponse } from "./product-click-request";
