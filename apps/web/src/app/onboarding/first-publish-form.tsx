"use client";
import { useActionState, useEffect, useRef } from "react";
import { DocumentLink } from "@/components/document-link";
import { firstIdentityPublishAction, type FirstPublishState } from "./first-publish-action";
import type { PreviewReceipt } from "@/lib/onboarding/preview-receipt-contract";

const initial: FirstPublishState = { status: "idle", message: null, handle: null };
export function FirstPublishForm({ receipt, blocked, onLock }: { receipt: PreviewReceipt; blocked: boolean; onLock: () => void }) {
  const [state, action, pending] = useActionState(firstIdentityPublishAction, initial);
  const locked = blocked || pending || state.status === "reload" || state.status === "published";
  const callback = useRef(onLock);
  useEffect(() => { callback.current = onLock; }, [onLock]);
  useEffect(() => { if (pending || state.status === "reload" || state.status === "published") callback.current(); }, [pending, state.status]);
  return <form action={action} className="space-y-4 rounded-2xl border-2 border-neutral-900 bg-amber-50 p-5">
    <h3 className="text-xl font-semibold">{state.status === "published" ? "Identity published." : "Ready to share your Identity?"}</h3>
    <p className="text-sm leading-6">{state.status === "published" ? "Share your published page or continue shaping your private Drafts." : "This publishes the Identity you just reviewed. Your Product and Resource Drafts stay in your private workspace."}</p>
    <input type="hidden" name="receiptId" value={receipt.receipt_id} />
    <input type="hidden" name="snapshotHash" value={receipt.snapshot_hash} />
    <input type="hidden" name="bundle" value="identity_only" />
    {state.status !== "published" && <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1 size-4 accent-neutral-900" type="checkbox" name="confirmIdentityOnly" value="true" required disabled={locked} />
      Publish only my Identity. Product and Resource Drafts stay private.</label>}
    {state.message && <p role={state.status === "error" || state.status === "reload" ? "alert" : "status"} className="text-sm leading-6">{state.message}</p>}
    {state.status === "published" && state.handle ? <div className="flex flex-wrap gap-4 text-sm font-medium underline">
      <DocumentLink href="/dashboard">Continue in workspace</DocumentLink>
      <DocumentLink href={`/${state.handle}`}>View published Identity</DocumentLink>
    </div> : state.status === "reload" ? <DocumentLink href="/onboarding" className="text-sm font-medium underline">Reload saved setup</DocumentLink> :
      <button type="submit" disabled={locked} className="rounded-full bg-neutral-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{pending ? "Publishing…" : "Publish Identity"}</button>}
  </form>;
}
