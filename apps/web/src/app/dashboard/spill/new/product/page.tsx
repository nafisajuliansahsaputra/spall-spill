import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { OwnerWorkspaceHeader } from "@/components/owner-workspace-header";
import { readResourceCatalogPage } from "@/lib/workspace/resource-catalog-page";
import { ProductDraftForm } from "./product-form";
export const metadata:Metadata={title:"Add Product",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function AddProductPage(){
 await readResourceCatalogPage();
 return <main id="main-content" className="entry-page"><OwnerWorkspaceHeader active="spill"/><div className="mx-auto max-w-3xl space-y-7 py-10">
  <Link prefetch={false} href="/dashboard/spill" className="text-sm underline">Back to Spill</Link>
  <div><span className="eyebrow">Something worth sharing</span><h1 className="my-4 font-serif text-5xl">Start with a Product.</h1><p className="text-sm leading-6">Paste a marketplace or affiliate URL, or enter a Product title manually. Save meaningful work now and continue shaping it privately.</p></div>
  <section className="rounded-3xl border border-neutral-300 bg-white/60 p-6"><ProductDraftForm creationId={randomUUID()}/></section>
  <p className="text-sm leading-6 text-neutral-600">Saved Drafts stay private. Source URLs are retained for review; they are not approved marketplace destinations. Images, destination checks and explicit publication are separate steps; publishing is not available here yet.</p>
 </div></main>;
}
