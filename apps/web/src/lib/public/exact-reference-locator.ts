import "server-only";
import { z } from "zod";
import { publicHandleSchema, publicSpillReferenceSchema } from "./locators";

const exactLocatorSchema = z.object({
  handle: publicHandleSchema,
  reference: z.string().min(1).max(17)
    .transform(value => value.startsWith("#") ? value.slice(1) : value)
    .pipe(publicSpillReferenceSchema),
}).strict();

/** Unmounted exact-locator parser; does not resolve ownership/type or classify keyword queries. */
export function parseExactSpillReferenceLocator(input: unknown): { handle: string; spill_reference: number } | null {
  try {
    const parsed = exactLocatorSchema.safeParse(input);
    return parsed.success ? { handle: parsed.data.handle, spill_reference: parsed.data.reference } : null;
  } catch { return null; }
}
