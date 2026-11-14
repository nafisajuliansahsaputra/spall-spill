"use client";
import { useActionState, useRef, useState } from "react";
import { DocumentLink } from "@/components/document-link";
import { createSpillCtaWorkingAction, type SpillCtaState } from "./spill-cta-actions";
const idle: SpillCtaState = { status: "idle", message: null, revision: null };
export function SpillIntegrationEditor({ revision }: { revision: number | null }) {
  const [base, setBase] = useState(revision);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(false);
  const [creationKey, setCreationKey] = useState(0);
  const admission = useRef(false);
  const frozen = reload || (!busy && revision !== null && (base === null || revision > base));
  async function submit(previous: SpillCtaState, form: FormData): Promise<SpillCtaState> {
    if (admission.current || frozen) return { status: "error", message: "Reload saved work before adding an integration.", revision: null };
    admission.current = true; setBusy(true);
    try {
      form.set("collectionRevision", base === null ? "" : String(base));
      const result = await createSpillCtaWorkingAction(previous, form);
      if (result.status === "saved" && result.revision !== null) setBase(result.revision);
      if (result.status === "reload") setReload(true);
      return result;
    } catch {
      setReload(true);
      return { status: "reload", message: "We couldn’t confirm this Spill integration. Reload saved work before trying again.", revision: null };
    } finally { admission.current = false; setBusy(false); }
  }
  return <div className="space-y-4">
    <p className="text-sm leading-6">Add a connection to your own Spill in Identity Working. Saving it does not publish it or make your Spill publicly available. Use Block composition to show, hide, move or remove saved integrations.</p>
    {frozen && <p role="alert" className="text-sm">Reload saved work to reconcile this integration before adding another.</p>}
    <SpillIntegrationForm key={creationKey} base={base} disabled={busy || frozen} submit={submit} another={() => setCreationKey(value => value + 1)} />
    <div data-spill-cta-reload><DocumentLink href="/dashboard/identity" className="text-sm underline">Reload saved Identity</DocumentLink></div>
  </div>;
}
function SpillIntegrationForm({ base, disabled, submit, another }: { base: number | null; disabled: boolean; submit: (previous: SpillCtaState, form: FormData) => Promise<SpillCtaState>; another: () => void }) {
  const [visibility, setVisibility] = useState("true");
  const [state, action, pending] = useActionState(submit, idle);
  const locked = disabled || pending || state.status === "saved";
  return <form action={action} onReset={event => event.preventDefault()} aria-label="New Spill integration" className="space-y-4 rounded-3xl border border-neutral-300 bg-white/60 p-6">
    <input type="hidden" name="collectionRevision" value={base ?? ""} />
    <label className="block text-sm font-medium">Working visibility<select name="visibility" value={visibility} disabled={locked} onChange={event => setVisibility(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="true">Visible in Working</option><option value="false">Hidden in Working</option></select></label>
    {state.message && <p role={state.status === "saved" ? "status" : "alert"} className="text-sm">{state.message}</p>}
    <button type="submit" disabled={locked} className="button disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Adding integration…" : "Add Spill integration to Working"}</button>
    {state.status === "saved" && <button type="button" onClick={another} disabled={disabled} className="ml-4 min-h-11 text-sm underline">Add another integration</button>}
  </form>;
}
