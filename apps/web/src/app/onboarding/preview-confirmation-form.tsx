"use client";

import { useActionState } from "react";
import type { PreviewConfirmationState } from "@/lib/onboarding/preview-receipt-contract";
import { confirmPreviewAction } from "./preview-receipt-action";

const initial: PreviewConfirmationState = { status: "idle", message: null, receipt: null };
export function PreviewConfirmationForm({ snapshotHash }: { snapshotHash: string }) {
  const [state, action, pending] = useActionState(confirmPreviewAction, initial);
  return <form action={action} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
    <input type="hidden" name="snapshotHash" value={snapshotHash} />
    <p className="text-sm leading-6">Confirm that you have reviewed this saved preview. Confirmation stays private and expires after ten minutes; it does not publish your Identity or Items.</p>
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className="text-sm leading-6">{state.message}</p> : null}
    <button type="submit" disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Confirming…" : state.status === "confirmed" ? "Confirm preview again" : "Confirm this preview"}
    </button>
  </form>;
}
