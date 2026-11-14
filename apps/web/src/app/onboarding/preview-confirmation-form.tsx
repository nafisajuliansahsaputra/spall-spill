"use client";

import { useActionState, useState } from "react";
import type { PreviewConfirmationState } from "@/lib/onboarding/preview-receipt-contract";
import { confirmPreviewAction } from "./preview-receipt-action";

import { FirstPublishForm } from "./first-publish-form";

const initial: PreviewConfirmationState = { status: "idle", message: null, receipt: null };
export function PreviewConfirmationForm({ snapshotHash, publishAvailable = false, publicationBlocked = false }: { snapshotHash: string; publishAvailable?: boolean; publicationBlocked?: boolean }) {
  const [state, action, pending] = useActionState(confirmPreviewAction, initial);
  const [publishLocked, setPublishLocked] = useState(false);
  return <div className="space-y-4"><form action={action} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
    <input type="hidden" name="snapshotHash" value={snapshotHash} />
    <p className="text-sm leading-6">{publishLocked ? "Your saved preview was reviewed. Publication status is shown below." : "Confirm that you have reviewed this saved preview. Confirmation stays private and expires after ten minutes; it does not publish your Identity or Items."}</p>
    {state.message && !publishLocked ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm leading-6">{state.message}</p> : null}
    <button type="submit" disabled={pending || publishLocked} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {publishLocked ? "Preview reviewed" : pending ? "Confirming…" : state.status === "confirmed" ? "Confirm preview again" : "Confirm this preview"}
    </button>
  </form>
    {state.receipt && publicationBlocked ? <p className="text-sm leading-6 text-neutral-600">Resolve the Identity issues shown in your preview before publishing. Your saved setup stays private.</p> : state.receipt && publishAvailable ? <FirstPublishForm key={state.receipt.receipt_id} receipt={state.receipt} blocked={pending} onLock={() => setPublishLocked(true)} /> :
      state.receipt ? <p className="text-sm leading-6 text-neutral-600">First publication is not available in this environment yet. Your saved setup stays private.</p> : null}
  </div>;
}
