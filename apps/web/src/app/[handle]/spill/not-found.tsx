"use client";
import { useParams } from "next/navigation";
import { DocumentLink } from "@/components/document-link";
import { isPublicIdentityPath } from "@/lib/public/identity-path";
export default function PublicSpillUnavailable(){const params=useParams();const handle=typeof params.handle==='string'&&isPublicIdentityPath(`/${params.handle}`)?params.handle:null;return <main id="main-content" className="entry-page"><section className="mx-auto max-w-3xl space-y-5 py-16"><span className="eyebrow">Spall Spill</span><h1 className="font-serif text-4xl">This Spill or Item is unavailable.</h1><p className="text-sm leading-6">Check the link or try again later.</p>{handle?<DocumentLink href={`/${handle}/spill`} className="inline-block underline">Browse this Spill</DocumentLink>:null}</section></main>;}
