import { z } from "zod";

export const publicHandleSchema = z.string().min(3).max(30)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/).transform((handle) => handle.toLowerCase());

export const publicSpillReferenceSchema = z.string().regex(/^[1-9][0-9]{0,15}$/)
  .transform(Number).pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
