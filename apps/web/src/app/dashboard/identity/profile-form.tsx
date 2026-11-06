"use client";
import { DocumentLink } from "@/components/document-link";
import { useActionState, useState } from "react";
import { saveProfileWorkingAction, type ProfileSaveState } from "./actions";
const initial: ProfileSaveState = { status: "idle", message: null, textRevision: null };
export function ProfileWorkingForm({ name, bio, profileRevision, textRevision }: {
  name: string | null; bio: string | null; profileRevision: number; textRevision: number | null;
}) {
  const [displayName, setDisplayName] = useState(name ?? "");
  const [biography, setBiography] = useState(bio ?? "");
  const [saved, setSaved] = useState({ name: name ?? "", bio: bio ?? "" });
  const [state, action, pending] = useActionState(async (previous: ProfileSaveState, form: FormData) => {
    const result = await saveProfileWorkingAction(previous, form);
    const submittedName = form.get("displayName"), submittedBio = form.get("bio");
    if (result.status === "saved" && typeof submittedName === "string" && typeof submittedBio === "string")
      setSaved({ name: submittedName, bio: submittedBio });
    return result;
  }, initial);
  // Textareas display LF even when HTML form submission serializes CRLF. This
  // comparison is a UI hint only; the saved payload is never normalized here.
  const dirty = displayName !== saved.name || biography.replace(/\r\n?/g, "\n") !== saved.bio.replace(/\r\n?/g, "\n");
  return <form action={action} aria-label="Profile Working" className="space-y-5">
    <input type="hidden" name="profileRevision" value={profileRevision} />
    <input type="hidden" name="textRevision" value={state.textRevision ?? textRevision ?? ""} />
    <label className="block text-sm font-medium">Display name<input className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" name="displayName" value={displayName} onChange={event => setDisplayName(event.target.value)} readOnly={pending} maxLength={16384} /></label>
    <label className="block text-sm font-medium">Bio<textarea className="mt-2 block min-h-32 w-full rounded-xl border border-neutral-300 bg-white p-3" name="bio" value={biography} onChange={event => setBiography(event.target.value)} readOnly={pending} maxLength={16384} /></label>
    <p className="text-sm leading-6 text-neutral-600">You can save unfinished text. Publishing will require a display name up to 80 characters and a bio up to 300 characters.</p>
    {dirty ? <p className="text-sm" role="status">You have unsaved edits.</p> : null}
    {state.message && !(state.status === "saved" && dirty) ? <p role={state.status === "saved" ? "status" : "alert"} className="text-sm leading-6">{state.message}</p> : null}
    <button className="button" disabled={pending || state.status === "reload"} type="submit">{pending ? "Saving Working…" : "Save Working"}</button>
    <DocumentLink className="ml-4 text-sm underline" href="/dashboard/identity">Reload saved work</DocumentLink>
  </form>;
}
