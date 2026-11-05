"use client";
import { useActionState, useRef, useState } from "react";
import { saveLinkWorkingAction, type LinkSaveState } from "./link-actions";
type LinkBlock = { blockId: string; kind: "social" | "generic_link"; isVisible: boolean; title: string | null; platform: string | null; destination: string | null };
const initial: LinkSaveState = { status: "idle", message: null, revision: null };
export function SavedLinksEditor({ revision, blocks }: { revision: number; blocks: LinkBlock[] }) {
  const [base, setBase] = useState(revision);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(false);
  const admission = useRef(false);
  async function save(previous: LinkSaveState, form: FormData) {
    if (admission.current || reload) return { status: "error", message: "Wait for the current save or reload saved work.", revision: null } as LinkSaveState;
    admission.current = true; setBusy(true);
    try {
      // Sibling forms share only acknowledgments from this editor, never an
      // incoming RSC revision that could silently rebase unsaved content.
      form.set("collectionRevision", String(base));
      const result = await saveLinkWorkingAction(previous, form);
      if (result.status === "saved" && result.revision !== null) setBase(result.revision);
      if (result.status === "reload") setReload(true);
      return result;
    } catch {
      setReload(true);
      return { status: "reload", message: "We couldn’t confirm the link save. Keep your edits and reload saved links.", revision: null } as LinkSaveState;
    } finally { admission.current = false; setBusy(false); }
  }
  return <div className="space-y-5">
    <p className="text-sm leading-6">Edit your saved Social and Generic Link blocks. Unfinished text stays private; saving never opens a destination.</p>
    {reload ? <p role="alert" className="text-sm">Reload saved work to reconcile all links before saving again. Your current inputs are retained.</p> : null}
    {blocks.map(block => <SavedLinkForm key={block.blockId} block={block} base={base} disabled={busy || reload} save={save} />)}
    <a className="text-sm underline" href="/dashboard/identity">Reload saved links</a>
  </div>;
}
function SavedLinkForm({ block, base, disabled, save }: { block: LinkBlock; base: number; disabled: boolean; save: (previous: LinkSaveState, form: FormData) => Promise<LinkSaveState> }) {
  const [title, setTitle] = useState(block.title ?? "");
  const [platform, setPlatform] = useState(block.platform ?? "");
  const [destination, setDestination] = useState(block.destination ?? "");
  const [saved, setSaved] = useState({ title: block.title ?? "", platform: block.platform ?? "", destination: block.destination ?? "" });
  const [state, action, pending] = useActionState(async (previous: LinkSaveState, form: FormData) => {
    const result = await save(previous, form);
    if (result.status === "saved") setSaved({ title: String(form.get("title")), platform: String(form.get("platform")), destination: String(form.get("destination")) });
    return result;
  }, initial);
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n");
  const dirty = normalize(title) !== normalize(saved.title) || normalize(platform) !== normalize(saved.platform) || normalize(destination) !== normalize(saved.destination);
  return <form action={action} aria-label={`${block.kind === "social" ? "Social" : "Generic Link"} Working`} data-block={block.blockId} className="space-y-4 rounded-3xl border border-neutral-300 bg-white/60 p-6">
    <h3 className="font-semibold">{block.kind === "social" ? "Social" : "Generic Link"} · {block.isVisible ? "Visible in Working" : "Hidden in Working"}</h3>
    <input type="hidden" name="blockId" value={block.blockId} /><input type="hidden" name="kind" value={block.kind} /><input type="hidden" name="collectionRevision" value={base} />
    <label className="block text-sm font-medium">Title<textarea name="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={1024} readOnly={disabled || pending} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    <label className="block text-sm font-medium">{block.kind === "social" ? "Social platform" : "Platform (not used for Generic Links)"}<textarea name="platform" value={platform} onChange={event => setPlatform(event.target.value)} maxLength={80} readOnly={disabled || pending} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    <label className="block text-sm font-medium">Destination<textarea name="destination" value={destination} onChange={event => setDestination(event.target.value)} maxLength={4096} readOnly={disabled || pending} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    {dirty ? <p role="status" className="text-sm">You have unsaved link edits.</p> : null}
    {state.message && !(state.status === "saved" && dirty) ? <p role={state.status === "saved" ? "status" : "alert"} className="text-sm leading-6">{state.message}</p> : null}
    <button type="submit" className="button" disabled={disabled || pending}>{pending ? "Saving link…" : "Save link Working"}</button>
  </form>;
}
