import type { Metadata } from "next";
import Image from "next/image";
import { notFound,redirect } from "next/navigation";
import { DocumentLink } from "@/components/document-link";
import { isPublicIdentityPath } from "@/lib/public/identity-path";
import { readPublicSpill,readPublicSpillDetail } from "@/lib/public/spill-server";
import { classifySpillQuery,decodeSpillCursor,spillKindSchema,spillPath,spillQuerySchema } from "@/lib/public/spill-contract";
import { RESOURCE_TYPES } from "@/lib/onboarding/resource-draft-contract";
export const metadata:Metadata={title:"Explore Spill",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function PublicSpillPage({params,searchParams}:{params:Promise<{handle:string}>;searchParams:Promise<{q?:string|string[];kind?:string|string[];cursor?:string|string[]}>}){
 const {handle}=await params;if(!isPublicIdentityPath(`/${handle}`))notFound();const requested=handle.toLowerCase(),input=await searchParams;
 const q=spillQuerySchema.safeParse(input.q??""),kind=spillKindSchema.safeParse(input.kind??"all");
 if(!q.success||!kind.success)return <Notice handle={requested} title="Check your search." text="Use up to 80 characters and one valid type filter."/>;
 const mode=classifySpillQuery(q.data);
 if(mode.mode!=="keyword"){
  if(mode.mode==="exact"){const found=await readPublicSpillDetail(requested,mode.reference);if(found===null)return <Notice handle={requested} title="Try again in a moment." text="We couldn’t check that reference right now."/>;if(found.status==="success")redirect(`/${found.detail.current_handle}/spill/${found.detail.spill_reference}`);}
  return <Notice handle={requested} title="No published Item with that reference." text="Check the exact reference, or browse and search by name."/>;
 }
 const cursor=input.cursor===undefined?null:decodeSpillCursor(input.cursor,q.data,kind.data);
 if(input.cursor!==undefined&&cursor===null)return <Notice handle={requested} title="Check your search." text="Start a fresh view to continue browsing."/>;
 const page=await readPublicSpill(requested,q.data,kind.data,cursor);if(page?.status==="unavailable")notFound();if(page===null)return <Notice handle={requested} title="Try again in a moment." text="We couldn’t load this Spill right now."/>;
 return <main id="main-content" className="entry-page"><div className="mx-auto max-w-6xl space-y-8 py-10"><header className="flex flex-wrap items-center justify-between gap-5"><DocumentLink href={`/${page.current_handle}`} className="min-w-0 break-words text-sm underline">{page.display_name} · @{page.current_handle}</DocumentLink><span className="eyebrow">Spall Spill</span></header>
 <section><span className="eyebrow">{q.data?"Search":"Explore"}</span><h1 className="my-4 font-serif text-5xl">Find the good stuff.</h1><p className="text-sm leading-6">Products and Resources, curated by {page.display_name}.</p></section>
 <Search handle={page.current_handle} q={q.data}/>
 {page.has_products&&page.has_resources?<nav aria-label="Spill types" className="flex flex-wrap gap-3">{([['all','All'],['product','Products'],['resource','Resources']] as const).map(([value,label])=><DocumentLink key={value} href={spillPath(page.current_handle,q.data,value)} aria-current={value===kind.data?"page":undefined} className={value===kind.data?"button":"rounded-full border border-neutral-300 px-5 py-3 text-sm"}>{label}</DocumentLink>)}</nav>:null}
 {q.data||kind.data!=="all"?<p role="status" className="text-sm leading-6">{q.data?`Search: “${q.data}”. `:""}{kind.data!=="all"?`Showing ${kind.data==='product'?'Products':'Resources'}. `:""}<DocumentLink href={spillPath(page.current_handle)} className="underline">Clear search and filters</DocumentLink></p>:null}
 {page.items.length?<ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{page.items.map(item=><li key={item.reference} data-public-spill-item={item.reference} className="overflow-hidden rounded-3xl border border-neutral-300 bg-white/70"><DocumentLink href={`/${page.current_handle}/spill/${item.reference}`} className="block focus-visible:outline-offset-4">{item.kind==='product'?<Image unoptimized src={item.primary_image_path!} alt={item.title} width={640} height={480} className="aspect-[4/3] w-full object-cover"/>:<div className="flex aspect-[4/3] items-center justify-center bg-amber-100 p-6 font-serif text-4xl">{RESOURCE_TYPES.find(([type])=>type===item.resource_type)?.[1]}</div>}<div className="space-y-3 p-5"><span className="eyebrow">{item.kind} · #{item.reference}</span><h2 className="break-words text-xl font-semibold">{item.title}</h2>{!item.available?<p className="text-sm text-neutral-600">Link temporarily unavailable</p>:null}</div></DocumentLink></li>)}</ul>:<section className="rounded-3xl border border-neutral-300 bg-white/50 p-8"><h2 className="font-serif text-3xl">Nothing matched this search.</h2><p className="my-4 text-sm">Try another name or clear your filters to explore this creator’s Spill.</p><DocumentLink href={spillPath(page.current_handle)} className="underline">Browse all Spill</DocumentLink></section>}
 <nav aria-label="More Spill" className="flex gap-6 text-sm">{cursor?<DocumentLink href={spillPath(page.current_handle,q.data,kind.data)} className="underline">Newest results</DocumentLink>:null}{page.has_more?<DocumentLink href={spillPath(page.current_handle,q.data,kind.data,page.next_cursor!)} className="underline">More Items</DocumentLink>:null}</nav>
 </div></main>;
}
function Search({handle,q}:{handle:string;q:string}){return <form action={`/${handle}/spill`} method="get" aria-label="Search Spill" className="flex flex-wrap gap-3"><label className="min-w-0 flex-1 text-sm font-medium">Search this Spill<input name="q" defaultValue={q} maxLength={160} placeholder="Search by name or enter #reference" className="mt-2 block w-full rounded-2xl border border-neutral-300 bg-white p-4"/></label><button className="button self-end">Find it</button></form>;}
function Notice({handle,title,text}:{handle:string;title:string;text:string}){return <main id="main-content" className="entry-page"><div className="mx-auto max-w-3xl space-y-6 py-14"><span className="eyebrow">Spall Spill</span><h1 className="font-serif text-4xl">{title}</h1><p className="text-sm leading-6">{text}</p><Search handle={handle} q=""/><DocumentLink href={spillPath(handle)} className="inline-block underline">Browse Spill</DocumentLink></div></main>;}
