import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { readResourceCatalogPage } from "@/lib/workspace/resource-catalog-page";
import { ResourceDraftForm } from "./resource-form";
export const metadata:Metadata={title:"Add Resource",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function AddResourcePage(){
 await readResourceCatalogPage();
 return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="spill"/><div className="mx-auto max-w-3xl space-y-7 py-10">
  <Link prefetch={false} href="/dashboard/spill" className="text-sm underline">Back to Spill</Link>
  <div><span className="eyebrow">A useful little thing</span><h1 className="my-4 font-serif text-5xl">Give your Resource a purpose.</h1><p className="text-sm leading-6">A menu, a portfolio, a document. Start with what it means to the people opening it.</p></div>
  <section className="rounded-3xl border border-neutral-300 bg-white/60 p-6"><ResourceDraftForm creationId={randomUUID()}/></section>
  <p className="text-sm leading-6 text-neutral-600">Saved Drafts stay private. Source checks and explicit publishing are separate steps; publishing is not available here yet.</p>
 </div></main>;
}
