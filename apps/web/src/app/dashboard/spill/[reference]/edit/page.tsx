import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { readResourceCatalogPage } from "@/lib/workspace/resource-catalog-page";
import { DocumentLink } from "@/components/document-link";
import { StarterItemForm } from "./item-form";
export const metadata:Metadata={title:"Edit saved Item",robots:{index:false,follow:false}};
export default async function StarterItemPage({params}:{params:Promise<{reference:string}>}){
 const {reference}=await params;if(!/^[1-9][0-9]{0,15}$/.test(reference)||!Number.isSafeInteger(Number(reference)))notFound();
 const page=await readResourceCatalogPage(Number(reference),true);if(!("item" in page)||!page.item)notFound();const item=page.item;
 return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="item"/>
  <div className="mx-auto max-w-3xl space-y-7 py-10"><Link prefetch={false} href="/dashboard/spill" className="text-sm underline">Back to Spill</Link>
   <div><span className="eyebrow">{item.kind} · #{item.reference}</span><h1 className="my-4 font-serif text-5xl">Keep shaping this {item.kind}.</h1><p className="text-sm leading-6">{item.published_lifecycle?`${item.published_lifecycle.charAt(0).toUpperCase()+item.published_lifecycle.slice(1)} · Working edits stay separate.`:"Draft · not published."}</p></div>
   {item.source_changed?<p role="status" className="rounded-xl border border-amber-300 p-4 text-sm">Your saved source changed. Your Working text is retained. Review it before saving against the latest source.</p>:null}
   <section aria-labelledby="item-edit-heading" className="rounded-3xl border border-neutral-300 bg-white/60 p-6"><h2 id="item-edit-heading" className="mb-5 text-2xl font-semibold">Saved Item Working</h2>
    {item.published_lifecycle==="archived"?<div className="space-y-4"><p>This Item is archived. Its saved work is retained; editing is unavailable while archived.</p><dl className="space-y-3 text-sm"><div><dt>Working title</dt><dd className="whitespace-pre-wrap break-all">{item.title??"Not set"}</dd></div><div><dt>Working source</dt><dd className="whitespace-pre-wrap break-all">{item.source_url??"Not set"}</dd></div></dl></div>:<StarterItemForm reference={item.reference} kind={item.kind} title={item.title} sourceUrl={item.source_url} resourceType={item.resource_type} sourceRevision={item.source_revision} workingRevision={item.working_revision}/>}
   </section>
   {item.kind==="product"?<section className="space-y-3" aria-label="Saved Product preparation"><h2 className="text-xl font-semibold">Your saved preparation</h2><p className="text-sm">Primary image: {item.has_primary_image?"Selected and retained":"Not selected"}</p>
    {item.destinations.length?<ul className="space-y-3">{item.destinations.map(destination=><li key={destination.provider_key} className="rounded-xl border border-neutral-300 p-4 text-sm"><p className="font-semibold">{destination.provider_key}</p><p className="mt-2 break-all">{destination.destination_url}</p><p className="mt-2">Destination checks are required before publishing.</p></li>)}</ul>:<p className="text-sm">No marketplace destinations saved yet.</p>}
   </section>:null}
   {item.kind==="product"?<DocumentLink href="/dashboard/spill/new/product" className="button">Add another Product</DocumentLink>:null}
   {item.kind==="resource"?<DocumentLink href="/dashboard/spill/new/resource" className="text-sm underline">Create another Resource</DocumentLink>:null}
   <p className="text-sm leading-6 text-neutral-600">Your saved Working stays private. Publishing and media/destination changes are not available here yet.</p>
  </div>
 </main>;
}
