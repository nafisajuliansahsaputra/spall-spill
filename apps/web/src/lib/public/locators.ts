import { z } from "zod";

export const publicHandleSchema = z.string().min(3).max(30)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$/).transform((handle) => handle.toLowerCase());
