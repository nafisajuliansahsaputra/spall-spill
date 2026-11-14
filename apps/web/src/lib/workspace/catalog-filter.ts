import { z } from "zod";
const reference=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const catalogFilterSchema=z.object({
 q:z.string().max(160).transform(q=>q.trim().replace(/\s+/gu," ")).refine(q=>Array.from(q).length<=80&&!/[\u0000-\u001f\u007f]/.test(q)&&q.isWellFormed()),
 kind:z.enum(["all","product","resource"]),lifecycle:z.enum(["all","draft","published","hidden","archived"]),before:reference.nullable(),
}).strict();
export type CatalogFilter=z.infer<typeof catalogFilterSchema>;
export function catalogFilterPath(filter:CatalogFilter,before:number|null=null){
 const p=new URLSearchParams();if(filter.q)p.set("q",filter.q);if(filter.kind!=="all")p.set("kind",filter.kind);if(filter.lifecycle!=="all")p.set("lifecycle",filter.lifecycle);if(before!==null)p.set("before",String(before));
 return `/dashboard/spill${p.size?`?${p}`:""}`;
}
