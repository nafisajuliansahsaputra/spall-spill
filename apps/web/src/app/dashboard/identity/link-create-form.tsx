"use client";
import { useActionState, useState } from "react";
import type { LinkSaveState } from "./link-actions";
const initial: LinkSaveState = { status: "idle", message: null, revision: null };
export function NewLinkForm({ base, disabled, create, another }: {
  base: number | null; disabled: boolean;
  create: (previous: LinkSaveState, form: FormData) => Promise<LinkSaveState>; another: () => void;
}) {
  const [state, action, pending] = useActionState(create, initial);
  const [kind, setKind] = useState("generic_link");
  const [visibility, setVisibility] = useState("true");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [destination, setDestination] = useState("");
  const locked = disabled || pending || state.status === "saved";
  return <form action={action} onReset={event => event.preventDefault()} aria-label="New link Working" className="space-y-4 rounded-3xl border border-neutral-300 bg-white/60 p-6">
    <h3 className="text-xl font-semibold">Add a link</h3>
    <input type="hidden" name="collectionRevision" value={base ?? ""} />
    <label className="block text-sm font-medium">Link type<select name="kind" value={kind} onChange={event => setKind(event.target.value)} disabled={locked} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="generic_link">Generic Link</option><option value="social">Social</option></select></label>
    <label className="block text-sm font-medium">Title<textarea name="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={1024} readOnly={locked} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    <label className="block text-sm font-medium">{kind === "social" ? "Social platform" : "Platform (not used for Generic Links)"}<textarea name="platform" value={platform} onChange={event => setPlatform(event.target.value)} maxLength={80} readOnly={locked} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    <label className="block text-sm font-medium">Destination<textarea name="destination" value={destination} onChange={event => setDestination(event.target.value)} maxLength={4096} readOnly={locked} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    <label className="block text-sm font-medium">Working visibility<select name="visibility" value={visibility} onChange={event => setVisibility(event.target.value)} disabled={locked} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="true">Visible in Working</option><option value="false">Hidden in Working</option></select></label>
    <p className="text-sm leading-6">Unfinished fields can be saved privately. Adding a link does not open its destination or publish it.</p>
    {state.message ? <p role={state.status === "saved" ? "status" : "alert"} className="text-sm leading-6">{state.message}</p> : null}
    <button type="submit" className="button" disabled={locked}>{pending ? "Adding link…" : "Add link to Working"}</button>
    {state.status === "saved" ? <button type="button" onClick={another} className="ml-4 text-sm underline" disabled={disabled}>Add another link</button> : null}
  </form>;
}
