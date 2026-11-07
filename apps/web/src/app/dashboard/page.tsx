import { DocumentLink } from "@/components/document-link";
import type { Metadata } from "next";
import Link from "next/link";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { readStarterRecoveryPage } from "@/lib/workspace/starter-page";
export const metadata: Metadata={title:"Your workspace",robots:{index:false,follow:false}};
export default async function OwnerHomePage() {
 const page=await readStarterRecoveryPage();
 return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="home" />
  <div className="mx-auto max-w-4xl space-y-9 py-12">
   <div><span className="eyebrow">@{page.current_handle} · Your workspace</span><h1 className="my-4 font-serif text-5xl">Pick up where you left off.</h1><p className="text-sm leading-6">A little attention. A little progress. Your saved work is here.</p></div>
   {page.items.length ? <section aria-labelledby="continue-heading" className="space-y-5"><h2 id="continue-heading" className="text-2xl font-semibold">Continue your saved setup Items</h2>
    <div className="grid gap-5 md:grid-cols-2">{page.items.map(item=><article key={item.reference} className="rounded-3xl border border-neutral-300 bg-white/60 p-6">
     <span className="eyebrow">{item.kind} · #{item.reference}</span><h3 className="my-3 line-clamp-2 break-words text-2xl font-semibold">{item.title?.trim()||`Untitled ${item.kind}`}</h3>
     <p className="text-sm leading-6">{item.published_lifecycle ? `${item.published_lifecycle.charAt(0).toUpperCase()+item.published_lifecycle.slice(1)} · Working edits stay separate.` : "Draft · not published."}</p>
     {item.working_revision!==null ? <p className="mt-2 text-sm">Working edits saved.</p> : null}
     {item.source_changed ? <p className="mt-2 text-sm">Review needed: your saved source changed.</p> : null}
     <Link prefetch={false} href={`/dashboard/spill/${item.reference}/edit`} className="button mt-5">{item.published_lifecycle==="archived"?`View archived ${item.kind}`:`Continue ${item.kind}`}</Link>
    </article>)}</div>
   </section> : null}
   <section className="rounded-3xl bg-ink p-7 text-paper" aria-labelledby="identity-action-heading"><span className="eyebrow">Start with you</span><h2 id="identity-action-heading" className="my-3 font-serif text-3xl">Make your Identity feel like you.</h2><p className="text-sm leading-6">Edit and save your Profile Working. Publishing is a separate step.</p><Link prefetch={false} href="/dashboard/identity" className="mt-5 inline-block font-semibold underline underline-offset-4">Edit Identity</Link><p className="mt-4 text-sm"><Link prefetch={false} href={`/${page.current_handle}`} className="underline underline-offset-4">View public Identity</Link> · Your public page shows Published content.</p></section>
   <DocumentLink href="/dashboard/spill/new/product" className="button">Add Product Draft</DocumentLink> <DocumentLink href="/dashboard/spill/new/resource" className="button">Add Resource Draft</DocumentLink>
   <p className="text-sm leading-6 text-neutral-600">New Product and Resource Drafts can be resumed from Spill. This overview resumes Items saved during setup. Publishing updates are not available here yet.</p>
  </div>
 </main>;
}
