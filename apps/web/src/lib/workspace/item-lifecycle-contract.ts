import { z } from "zod";
const revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const itemLifecycleSchema=z.enum(["published","hidden","archived"]);
export const lifecycleCommandSchema=z.object({intent_id:z.string().uuid().transform(v=>v.toLowerCase()),reference:revision,expected_revision:revision,expected_lifecycle:itemLifecycleSchema,action:z.enum(["hide","restore","archive"]),confirmed:z.boolean()}).strict().refine(v=>v.confirmed===(v.action==="archive"));
export const lifecyclePageSchema=z.object({status:z.literal("success"),current_handle:z.string().min(3).max(30).regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/),primary_use_case:z.enum(["creator","affiliate","business","personal","other"]),reference:revision,kind:z.enum(["product","resource"]),lifecycle:itemLifecycleSchema,revision}).strict();
export const lifecycleAckSchema=z.object({status:z.literal("success"),intent_id:z.string().uuid(),reference:revision,kind:z.enum(["product","resource"]),lifecycle:itemLifecycleSchema,revision}).strict();
export type LifecyclePage=z.infer<typeof lifecyclePageSchema>;
export function lifecycleTarget(action:"hide"|"restore"|"archive",state:z.infer<typeof itemLifecycleSchema>){return action==="hide"&&state==="published"?"hidden":action==="restore"&&state==="hidden"?"published":action==="restore"&&state==="archived"?"hidden":action==="archive"&&state!=="archived"?"archived":null;}
