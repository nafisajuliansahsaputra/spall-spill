import { z } from "zod";
import { publicHandleSchema,publicSpillReferenceSchema } from "./locators";
import { isPublicIdentityPath } from "./identity-path";
import { providerKeySchema } from "./product-contract";
import { resourceTypeSchema } from "../onboarding/resource-draft-contract";
export const spillText=(max:number)=>z.string().min(1).max(max*2).refine(v=>Array.from(v).length<=max&&v.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(v)&&v.isWellFormed());
export const spillQuerySchema=z.string().max(160).transform(v=>v.trim().replace(/\s+/gu," ")).refine(v=>Array.from(v).length<=80&&!/[\u0000-\u001f\u007f]/.test(v)&&v.isWellFormed());
export const spillKindSchema=z.enum(["all","product","resource"]);
const handle=publicHandleSchema.refine(v=>isPublicIdentityPath(`/${v}`));
const publishedTime=z.iso.datetime({precision:6});
const rank=z.number().int().min(0).max(3);
const reference=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const spillCursorSchema=z.object({q:spillQuerySchema,kind:spillKindSchema,rank,published_at:publishedTime,reference}).strict();
export type SpillCursor=z.infer<typeof spillCursorSchema>;
const item=z.object({reference,rank,published_at:publishedTime,kind:z.enum(["product","resource"]),title:spillText(160),resource_type:resourceTypeSchema.nullable(),primary_image_path:z.string().max(100).nullable(),available:z.boolean()}).strict();
export const spillBrowseSchema=z.object({status:z.literal("success"),current_handle:handle,display_name:spillText(80),q:spillQuerySchema,kind:spillKindSchema,has_products:z.boolean(),has_resources:z.boolean(),items:z.array(item).max(20),has_more:z.boolean(),next_cursor:spillCursorSchema.nullable()}).strict().refine(v=>(v.has_products||v.has_resources)&&v.items.every(row=>(v.kind==="all"||row.kind===v.kind)&&(row.kind==="product"?row.resource_type===null&&row.primary_image_path===`/media/product/${v.current_handle}/${row.reference}`:row.resource_type!==null&&row.primary_image_path===null))&&(v.has_more?v.items.length===20&&v.next_cursor!==null&&v.next_cursor.reference===v.items.at(-1)!.reference&&v.next_cursor.q===v.q&&v.next_cursor.kind===v.kind:v.next_cursor===null)&&new Set(v.items.map(row=>row.reference)).size===v.items.length&&v.items.every((row,i)=>
 (row.kind==="product"?v.has_products:v.has_resources)&&(v.q===""?row.rank===0:row.rank>0)&&(!i||compareSpillPosition(row,v.items[i-1]!)<0))&&(!v.has_more||(v.next_cursor!.rank===v.items.at(-1)!.rank&&v.next_cursor!.published_at===v.items.at(-1)!.published_at)));
const detailContext={status:z.literal("success"),current_handle:handle,display_name:spillText(80),spill_reference:reference,title:spillText(160)};
const product=z.object({...detailContext,primary_image_path:z.string().max(100),destinations:z.array(z.object({provider_key:providerKeySchema,available:z.boolean()}).strict()).min(1).max(10)}).strict().refine(v=>v.primary_image_path===`/media/product/${v.current_handle}/${v.spill_reference}`&&new Set(v.destinations.map(d=>d.provider_key)).size===v.destinations.length);
const resource=z.object({...detailContext,resource_type:resourceTypeSchema,available:z.boolean()}).strict();
export const spillDetailSchema=z.union([z.object({status:z.literal("success"),item_type:z.literal("product"),detail:product}).strict(),z.object({status:z.literal("success"),item_type:z.literal("resource"),detail:resource}).strict()]);
export type SpillBrowse=z.infer<typeof spillBrowseSchema>;
export type SpillDetail=z.infer<typeof spillDetailSchema>;
export function classifySpillQuery(q:string):{mode:"exact";reference:number}|{mode:"invalid_reference"|"keyword"}{const parsed=publicSpillReferenceSchema.safeParse(q.startsWith("#")?q.slice(1):q);if(parsed.success)return {mode:"exact",reference:parsed.data};return {mode:/^#?[+-]?[0-9٠-٩۰-۹０-９]+(?:[.,eE][0-9+\-]+)?$/u.test(q)?"invalid_reference":"keyword"};}
export function spillPath(handle:string,q="",kind:z.infer<typeof spillKindSchema>="all",cursor?:SpillCursor){const p=new URLSearchParams();if(q)p.set("q",q);if(kind!=="all")p.set("kind",kind);if(cursor)p.set("cursor",Buffer.from(JSON.stringify(cursor)).toString("base64url"));return `/${handle}/spill${p.size?`?${p}`:""}`;}
export function decodeSpillCursor(value:unknown,q:string,kind:z.infer<typeof spillKindSchema>):SpillCursor|null{try{if(typeof value!=="string"||value.length>1024||!/^[A-Za-z0-9_-]+$/.test(value))return null;const bytes=Buffer.from(value,"base64url");if(bytes.toString("base64url")!==value)return null;const raw=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));const parsed=spillCursorSchema.safeParse(raw);return parsed.success&&raw.q===q&&parsed.data.q===q&&parsed.data.kind===kind?parsed.data:null;}catch{return null;}}

export function compareSpillPosition(a:{rank:number;published_at:string;reference:number},b:{rank:number;published_at:string;reference:number}){return a.rank-b.rank||(a.published_at===b.published_at?0:a.published_at>b.published_at?1:-1)||a.reference-b.reference;}
