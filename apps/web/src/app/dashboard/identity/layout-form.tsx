"use client";
import { useActionState, useCallback, useState } from "react";
import { saveLayoutWorkingAction, type LayoutSaveState } from "./layout-actions";
const styles = [
  ["clean", "Clean", "A clear, simple starting point."],
  ["social_focus", "Social focus", "Start with your connections."],
  ["featured", "Featured", "Give your highlights room to stand out."],
  ["business", "Business", "A composed starting point for your work."],
] as const;
const initial: LayoutSaveState = { status: "idle", message: null, revision: null };
export function LayoutWorkingForm({ starterKey, revision }: { starterKey: string; revision: number }) {
  const [selected, setSelected] = useState(starterKey);
  const [saved, setSaved] = useState(starterKey);
  const [state, action, pending] = useActionState(async (previous: LayoutSaveState, form: FormData) => {
    const result = await saveLayoutWorkingAction(previous, form);
    if (result.status === "saved") setSaved(String(form.get("starterKey")));
    return result;
  }, initial);
  const captureSelection = useCallback((node: HTMLFormElement | null) => {
    const choice = node?.querySelector<HTMLInputElement>('input[name="starterKey"]:checked');
    if (choice) setSelected(choice.value);
  }, []);
  const dirty = selected !== saved;
  // React form actions reset native radio defaultChecked after resolution. Keep
  // this native choice intact on both acknowledged and uncertain saves.
  return <form ref={captureSelection} action={action} onReset={event => event.preventDefault()} aria-label="Starting style Working" className="space-y-5">
    <input type="hidden" name="layoutRevision" value={state.revision ?? revision} />
    <fieldset disabled={pending} className="space-y-3">
      <legend className="mb-3 text-sm leading-6">Choose a starting style for your saved composition. Every style is available to you.</legend>
      <div className="grid gap-3 sm:grid-cols-2">{styles.map(([key, label, description]) =>
        <label key={key} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${selected === key ? "border-neutral-900 bg-white" : "border-neutral-300"}`}>
          <input type="radio" name="starterKey" value={key} defaultChecked={starterKey === key} onChange={() => setSelected(key)} className="mt-1" />
          <span><span className="block font-semibold">{label}</span><span className="mt-1 block text-sm leading-6">{description}</span></span>
        </label>)}</div>
    </fieldset>
    <p className="text-sm leading-6 text-neutral-600">Saving changes only the starting style in Working. Your Profile, blocks and published Identity stay as they are.</p>
    {dirty ? <p role="status" className="text-sm">You have an unsaved style choice.</p> : null}
    {state.message && !(state.status === "saved" && dirty) ? <p role={state.status === "saved" ? "status" : "alert"} className="text-sm leading-6">{state.message}</p> : null}
    <button className="button" type="submit" disabled={pending || state.status === "reload"}>{pending ? "Saving style…" : "Save starting style"}</button>
    <a className="ml-4 text-sm underline" href="/dashboard/identity">Reload saved work</a>
  </form>;
}
