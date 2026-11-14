import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { DocumentLink } from "@/components/document-link";
import { isPublicIdentityPath } from "@/lib/public/identity-path";
import { publicSpillReferenceSchema } from "@/lib/public/locators";
import { readPublicSpillDetail } from "@/lib/public/spill-server";
import { RESOURCE_TYPES } from "@/lib/onboarding/resource-draft-contract";
export const metadata:Metadata={title:"Spill Item",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function PublicSpillDetailPage({params}:{params:Promise<{handle:string;reference:string}>}){
 const input=await params;if(!isPublicIdentityPath(`/${input.handle}`))notFound();const reference=publicSpillReferenceSchema.safeParse(input.reference);if(!reference.success)notFound();
 const result=await readPublicSpillDetail(input.handle,reference.data);if(result?.status==="unavailable")notFound();if(result===null)return <main id="main-content" className="entry-page"><div className="mx-auto max-w-3xl space-y-6 py-14"><h1 className="font-serif text-4xl">Try again in a moment.</h1><p>We couldn’t load this Item right now.</p><DocumentLink href={`/${input.handle}/spill/${reference.data}`} className="underline">Try again</DocumentLink></div></main>;
 const item=result.detail;return <main id="main-content" className="entry-page"><article className="mx-auto max-w-4xl space-y-7 py-10"><nav aria-label="Creator navigation" className="flex flex-wrap justify-between gap-4 text-sm"><DocumentLink href={`/${item.current_handle}`} className="min-w-0 break-words underline">{item.display_name} · @{item.current_handle}</DocumentLink><DocumentLink href={`/${item.current_handle}/spill`} className="underline">Browse Spill</DocumentLink></nav><div><span className="eyebrow">{result.item_type} · #{item.spill_reference}</span><h1 className="my-5 break-words font-serif text-5xl">{item.title}</h1></div>
 {result.item_type==='product'?<><Image unoptimized src={result.detail.primary_image_path} alt={item.title} width={900} height={675} className="aspect-[4/3] w-full rounded-3xl bg-white object-contain"/><section aria-label="Marketplaces" className="rounded-3xl border border-neutral-300 bg-white/50 p-6"><h2 className="text-xl font-semibold">Where to find it</h2><ul className="mt-4 flex flex-wrap gap-3">{result.detail.destinations.map(d=><li key={d.provider_key} className="max-w-full break-all rounded-full border border-neutral-300 px-4 py-2 text-sm">{d.provider_key.startsWith('external:')?d.provider_key.slice(9):d.provider_key}{d.available?'':' · Unavailable'}</li>)}</ul></section></>:<section className="rounded-3xl bg-amber-100 p-10"><p className="eyebrow">Resource</p><h2 className="mt-4 font-serif text-3xl">{RESOURCE_TYPES.find(([type])=>type===result.detail.resource_type)?.[1]}</h2></section>}
 <p role="status" className="rounded-2xl border border-neutral-300 bg-white/60 p-5 text-sm leading-6">Links are temporarily unavailable. Please try again later.</p>
 </article></main>;
}
