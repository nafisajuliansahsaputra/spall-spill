import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentLink } from "@/components/document-link";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { readResourceCatalogPage } from "@/lib/workspace/resource-catalog-page";
export const metadata:Metadata={title:"Your Spill",robots:{index:false,follow:false}};
export default async function SpillManagerPage({searchParams}:{searchParams:Promise<{before?:string|string[]}>}){
 const {before}=await searchParams;if(before!==undefined&&(typeof before!=="string"||!/^[1-9][0-9]{0,15}$/.test(before)||!Number.isSafeInteger(Number(before))))notFound();
 const page=await readResourceCatalogPage(before===undefined?null:Number(before));if(!("items" in page))throw Error("Catalog shape unavailable");
 return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="spill"/><div className="mx-auto max-w-4xl space-y-8 py-10">
  <div className="flex flex-wrap items-end justify-between gap-5"><div><span className="eyebrow">@{page.current_handle} · Your Spill</span><h1 className="my-4 font-serif text-5xl">Good things, kept here.</h1><p className="text-sm leading-6">Your saved Items, newest reference first. Draft and Working content stays private.</p></div><DocumentLink href="/dashboard/spill/new/product" className="button">Add Product Draft</DocumentLink> <DocumentLink href="/dashboard/spill/new/resource" className="button">Add Resource</DocumentLink></div>
  {page.items.length?<ul className="grid gap-5 sm:grid-cols-2">{page.items.map(item=><li key={item.reference} className="rounded-3xl border border-neutral-300 bg-white/60 p-6">
   <span className="eyebrow">{item.kind} · #{item.reference}</span><h2 className="my-3 break-words text-2xl font-semibold">{item.title_preview?.trim()||`Untitled ${item.kind}`}</h2>
   <p className="text-sm">{item.published_lifecycle?`${item.published_lifecycle.charAt(0).toUpperCase()+item.published_lifecycle.slice(1)} · Working stays separate.`:"Draft · not published."}</p>
   {item.working_revision!==null?<p className="mt-2 text-sm">Working saved.</p>:null}{item.source_changed?<p className="mt-2 text-sm">Source review needed.</p>:null}
   <Link prefetch={false} href={`/dashboard/spill/${item.reference}/edit`} className="mt-5 inline-block font-semibold underline underline-offset-4">{item.published_lifecycle==="archived"?"View archived Item":"Edit saved Item"}</Link>
  </li>)}</ul>:<section className="rounded-3xl border border-neutral-300 p-8"><h2 className="font-serif text-3xl">Start with something useful.</h2><p className="mt-3 text-sm leading-6">No saved Items in this view. Create a Resource when you are ready.</p></section>}
  <nav aria-label="Spill pages" className="flex flex-wrap gap-6 text-sm">{before!==undefined?<Link prefetch={false} href="/dashboard/spill" className="underline">Newest Items</Link>:null}{page.has_more?<Link prefetch={false} href={`/dashboard/spill?before=${page.next_before_reference}`} className="underline">Older Items</Link>:null}</nav>
  <p className="text-sm leading-6 text-neutral-600">Resume saved Items or create Product and Resource Drafts here. Publishing and lifecycle actions are not available in this view yet.</p>
 </div></main>;
}
