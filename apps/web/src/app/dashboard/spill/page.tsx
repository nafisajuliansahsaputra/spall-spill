import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DocumentLink } from "@/components/document-link";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { ownerReferenceEditorPath } from "@/lib/workspace/owner-reference-entry";
import { readResourceCatalogPage, requireResourceCatalogOwner } from "@/lib/workspace/resource-catalog-page";
import { catalogFilterSchema, catalogFilterPath, type CatalogFilter } from "@/lib/workspace/catalog-filter";
export const metadata:Metadata={title:"Your Spill",robots:{index:false,follow:false}};
export default async function SpillManagerPage({searchParams}:{searchParams:Promise<{before?:string|string[];reference?:string|string[];q?:string|string[];kind?:string|string[];lifecycle?:string|string[]}>}){
 const {before,reference,q,kind,lifecycle}=await searchParams;if(before!==undefined&&(typeof before!=="string"||!/^[1-9][0-9]{0,15}$/.test(before)||!Number.isSafeInteger(Number(before))))notFound();
 const parsedFilter=catalogFilterSchema.safeParse({q:q??"",kind:kind??"all",lifecycle:lifecycle??"all",before:before===undefined?null:Number(before)});
 if(!parsedFilter.success){
  await requireResourceCatalogOwner();
  return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="spill"/><section className="mx-auto max-w-4xl space-y-6 py-10"><h1 className="font-serif text-4xl">Check your search and filters.</h1><p role="alert" className="text-sm leading-6">Use a title or reference up to 80 characters and one valid option per filter. Your saved Items have not changed.</p><CatalogSearch filter={{q:"",kind:"all",lifecycle:"all",before:null}}/><DocumentLink href="/dashboard/spill" className="text-sm underline">Back to saved Items</DocumentLink></section></main>;
 }
 const filter=parsedFilter.data;
 const scoped=filter.q!==""||filter.kind!=="all"||filter.lifecycle!=="all";
 const target=ownerReferenceEditorPath(reference);
 if(target){
  const lookup=await readResourceCatalogPage(Number(target.split("/")[3]),true);
  if(!("item" in lookup))throw Error("Item lookup shape unavailable");
  if(lookup.item)redirect(target);
  return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="spill"/><div className="mx-auto max-w-4xl space-y-8 py-10">
   <span className="eyebrow">@{lookup.current_handle} · Your Spill</span><h1 className="font-serif text-4xl">No saved Item with that reference.</h1>
   <p className="text-sm leading-6">Check the reference or return to your saved Items. No Draft or Working content was changed.</p>
   <ReferenceForm reference={reference}/><DocumentLink href="/dashboard/spill" className="text-sm underline">Back to saved Items</DocumentLink>
  </div></main>;
 }
 const page=await readResourceCatalogPage(filter.before,false,scoped?filter:undefined);if(!("items" in page))throw Error("Catalog shape unavailable");
 return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="spill"/><div className="mx-auto max-w-4xl space-y-8 py-10">
  <div className="flex flex-wrap items-end justify-between gap-5"><div><span className="eyebrow">@{page.current_handle} · Your Spill</span><h1 className="my-4 font-serif text-5xl">Good things, kept here.</h1><p className="text-sm leading-6">Your saved Items, newest reference first. Draft and Working content stays private.</p></div><DocumentLink href="/dashboard/spill/new/product" className="button">Add Product Draft</DocumentLink> <DocumentLink href="/dashboard/spill/new/resource" className="button">Add Resource</DocumentLink></div>
  <ReferenceForm reference={reference}/>
  <CatalogSearch filter={filter}/>
  {scoped?<p role="status" className="text-sm leading-6">{page.items.length} matching saved Items on this page. {filter.q?`Search: “${filter.q}”. `:""}Type: {{all:"All types",product:"Products",resource:"Resources"}[filter.kind]}. Lifecycle: {{all:"All states",draft:"Draft",published:"Published",hidden:"Hidden",archived:"Archived"}[filter.lifecycle]}. <DocumentLink href="/dashboard/spill" className="underline">Clear search and filters</DocumentLink></p>:null}
  {page.items.length?<ul className="grid gap-5 sm:grid-cols-2">{page.items.map(item=><li key={item.reference} className="rounded-3xl border border-neutral-300 bg-white/60 p-6">
   <span className="eyebrow">{item.kind} · #{item.reference}</span><h2 className="my-3 break-words text-2xl font-semibold">{item.title_preview?.trim()||`Untitled ${item.kind}`}</h2>
   <p className="text-sm">{item.published_lifecycle?`${item.published_lifecycle.charAt(0).toUpperCase()+item.published_lifecycle.slice(1)} · Working stays separate.`:"Draft · not published."}</p>
   {item.working_revision!==null?<p className="mt-2 text-sm">Working saved.</p>:null}{item.source_changed?<p className="mt-2 text-sm">Source review needed.</p>:null}
   <Link prefetch={false} href={`/dashboard/spill/${item.reference}/edit`} className="mt-5 inline-block font-semibold underline underline-offset-4">{item.published_lifecycle==="archived"?"View archived Item":"Edit saved Item"}</Link>
  </li>)}</ul>:<section className="rounded-3xl border border-neutral-300 p-8"><h2 className="font-serif text-3xl">{scoped?"No Items match this scope.":"Start with something useful."}</h2><p className="mt-3 text-sm leading-6">{scoped?"Try another title or reference, or clear your search and filters to see saved Items.":"No saved Items in this view. Create a Resource when you are ready."}</p>{scoped?<DocumentLink href="/dashboard/spill" className="mt-4 inline-block text-sm underline">Show all saved Items</DocumentLink>:null}</section>}
  <nav aria-label="Spill pages" className="flex flex-wrap gap-6 text-sm">{before!==undefined?<Link prefetch={false} href={catalogFilterPath(filter)} className="underline">Newest Items</Link>:null}{page.has_more?<Link prefetch={false} href={catalogFilterPath(filter,page.next_before_reference)} className="underline">Older Items</Link>:null}</nav>
  <p className="text-sm leading-6 text-neutral-600">Resume saved Items or create Product and Resource Drafts here. Publishing and lifecycle actions are not available in this view yet.</p>
 </div></main>;
}

function ReferenceForm({reference}:{reference:string|string[]|undefined}){
 const invalid=reference!==undefined&&ownerReferenceEditorPath(reference)===null;
 return <form action="/dashboard/spill" method="get" aria-label="Find saved Item" className="space-y-3 rounded-3xl border border-neutral-300 bg-white/60 p-6">
   <label className="block text-sm font-medium">Find by #reference<input name="reference" maxLength={17} defaultValue={typeof reference==="string"?reference.slice(0,17):""} placeholder="#42" className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
   <p className="text-sm">Enter the exact reference, with or without #, to open your saved Product or Resource.</p>
   {invalid?<p role="alert" className="text-sm">Enter a positive reference without spaces or leading zeroes.</p>:null}
   <button className="button">Open saved Item</button>
  </form>;
}

function CatalogSearch({filter}:{filter:CatalogFilter}){
 return <form action="/dashboard/spill" method="get" aria-label="Search saved Items" className="grid gap-4 rounded-3xl border border-neutral-300 bg-white/60 p-6 sm:grid-cols-2">
  <label className="block text-sm font-medium sm:col-span-2">Search saved Items<input name="q" maxLength={160} defaultValue={filter.q} placeholder="Title or #reference" className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
  <label className="block text-sm font-medium">Item type<select name="kind" defaultValue={filter.kind} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="all">All types</option><option value="product">Products</option><option value="resource">Resources</option></select></label>
  <label className="block text-sm font-medium">Published lifecycle<select name="lifecycle" defaultValue={filter.lifecycle} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="all">All lifecycle states</option><option value="draft">Draft (not published)</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="archived">Archived</option></select></label>
  <p className="text-sm leading-6 sm:col-span-2">Search uses your saved titles. Working edits stay separate from Published lifecycle.</p><button className="button justify-self-start">Search and filter</button>
 </form>;
}
