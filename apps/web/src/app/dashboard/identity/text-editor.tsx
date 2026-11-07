"use client";
import { useActionState, useRef, useState } from "react";
import { DocumentLink } from "@/components/document-link";
import { createTextWorkingAction, saveTextWorkingAction, type TextSaveState } from "./text-actions";
type TextBlock = { blockId: string; isVisible: boolean; text: string | null; missing: boolean };
type Operation = (previous: TextSaveState, form: FormData) => Promise<TextSaveState>;
const idle: TextSaveState = { status: "idle", message: null, revision: null };
export function TextBlocksEditor({ revision, blocks }: { revision: number | null; blocks: TextBlock[] }) {
  const [base, setBase] = useState(revision);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(false);
  const [creationKey, setCreationKey] = useState(0);
  const admission = useRef(false);
  const newer = !busy && revision !== null && (base === null || revision > base);
  const frozen = reload || newer;
  async function run(operation: Operation, previous: TextSaveState, form: FormData): Promise<TextSaveState> {
    if (admission.current || frozen) return { status: "error", message: "Wait for the current save or reload saved work.", revision: null };
    admission.current = true; setBusy(true);
    try {
      form.set("collectionRevision", base === null ? "" : String(base));
      const result = await operation(previous, form);
      if (result.status === "saved" && result.revision !== null) setBase(result.revision);
      if (result.status === "reload") setReload(true);
      return result;
    } catch {
      setReload(true);
      return { status: "reload", message: "We couldn’t confirm this Text change. Keep your text and reload saved work.", revision: null };
    } finally { admission.current = false; setBusy(false); }
  }
  return <div className="space-y-5">
    <p className="text-sm leading-6">Add a note, introduction or story. Text stays plain and private in Working until you explicitly publish.</p>
    {frozen ? <p role="alert" className="text-sm">Reload saved work to reconcile all Text blocks before saving again. Your current inputs are retained.</p> : null}
    {blocks.map(block => <TextForm key={block.blockId} block={block} base={base} disabled={busy || frozen} submit={(previous, form) => run(saveTextWorkingAction, previous, form)} />)}
    <TextForm key={`new-${creationKey}`} base={base} disabled={busy || frozen} submit={(previous, form) => run(createTextWorkingAction, previous, form)} another={() => setCreationKey(value => value + 1)} />
    <div data-text-reload><DocumentLink href="/dashboard/identity" className="text-sm underline">Reload saved Text blocks</DocumentLink></div>
  </div>;
}
function TextForm({ block, base, disabled, submit, another }: { block?: TextBlock; base: number | null; disabled: boolean; submit: Operation; another?: () => void }) {
  const [text, setText] = useState(block?.text ?? "");
  const [saved, setSaved] = useState(block?.text ?? "");
  const [visibility, setVisibility] = useState("true");
  const [state, action, pending] = useActionState(async (previous: TextSaveState, form: FormData) => {
    const result = await submit(previous, form);
    if (result.status === "saved") setSaved(String(form.get("text")));
    return result;
  }, idle);
  const locked = disabled || pending || (!block && state.status === "saved");
  const dirty = text.replace(/\r\n?/g, "\n") !== saved.replace(/\r\n?/g, "\n");
  const hasControls = Array.from(text).some(char => { const code = char.codePointAt(0)!; return (code < 32 && ![9, 10, 13].includes(code)) || code === 127; });
  return <form action={action} onReset={event => event.preventDefault()} aria-label={block ? "Text Working" : "New Text Working"} data-text-block={block?.blockId} className="space-y-4 rounded-3xl border border-neutral-300 bg-white/60 p-6">
    <h3 className="text-xl font-semibold">{block ? `Text · ${block.isVisible ? "Visible in Working" : "Hidden in Working"}` : "Add Text"}</h3>
    <input type="hidden" name="collectionRevision" value={base ?? ""} />
    {block ? <input type="hidden" name="blockId" value={block.blockId} /> : null}
    {block?.missing ? <p className="text-sm">This saved block has no content yet. Save Text to fill it in.</p> : null}
    <label className="block text-sm font-medium">Text<textarea name="text" rows={5} maxLength={32768} value={text} readOnly={locked} onChange={event => setText(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    {!text.trim() ? <p className="text-sm">Empty Text can be saved privately; content is needed before publication.</p> : null}
    {hasControls ? <p className="text-sm">Control characters are retained in Working and need review before publication.</p> : null}
    {!block ? <label className="block text-sm font-medium">Working visibility<select name="visibility" value={visibility} disabled={locked} onChange={event => setVisibility(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="true">Visible in Working</option><option value="false">Hidden in Working</option></select></label> : null}
    {dirty ? <p role="status" className="text-sm">You have unsaved Text edits.</p> : null}
    {state.message && !(state.status === "saved" && dirty) ? <p role={state.status === "saved" ? "status" : "alert"} className="text-sm">{state.message}</p> : null}
    <button type="submit" disabled={locked} className="button disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving Text…" : block ? "Save Text Working" : "Add Text to Working"}</button>
    {!block && state.status === "saved" ? <button type="button" onClick={another} disabled={disabled} className="ml-4 text-sm underline">Add another Text block</button> : null}
  </form>;
}
