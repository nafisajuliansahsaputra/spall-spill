import "server-only";
import { z } from "zod";

export const identityBlockPageRequestSchema = z.object({
  expected_collection_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).nullable(),
  after_position: z.number().int().min(1).max(2147483647).nullable(),
}).strict().refine(value => (value.expected_collection_revision === null) === (value.after_position === null));
export type IdentityBlockPageRequest = z.infer<typeof identityBlockPageRequestSchema>;
export type IdentityBlockPageRequestResult = { status: "invalid_page_request" }
  | { status: "request"; data: IdentityBlockPageRequest };

/** Syntactic seek precondition only; no Owner, persistence, page or completeness authority. */
export function inspectIdentityBlockPageRequest(value: unknown): IdentityBlockPageRequestResult {
  const parsed = identityBlockPageRequestSchema.safeParse(value);
  return parsed.success ? { status: "request", data: parsed.data } : { status: "invalid_page_request" };
}
