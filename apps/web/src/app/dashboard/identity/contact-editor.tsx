"use client";
import { useActionState, useRef, useState } from "react";
import { DocumentLink } from "@/components/document-link";
import { createContactWorkingAction, saveContactWorkingAction, type ContactSaveState } from "./contact-actions";
type ContactBlock = { blockId: string; isVisible: boolean; contactType: "email" | "whatsapp" | "phone" | null; label: string | null; value: string | null; missing: boolean };
type Operation = (previous: ContactSaveState, form: FormData) => Promise<ContactSaveState>;
const idle: ContactSaveState = { status: "idle", message: null, revision: null };
export function ContactBlocksEditor({ revision, blocks }: { revision: number | null; blocks: ContactBlock[] }) {
  const [base, setBase] = useState(revision);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(false);
  const [creationKey, setCreationKey] = useState(0);
  const admission = useRef(false);
  const newer = !busy && revision !== null && (base === null || revision > base);
  const frozen = reload || newer;
  async function run(operation: Operation, previous: ContactSaveState, form: FormData): Promise<ContactSaveState> {
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
      return { status: "reload", message: "We couldn’t confirm this Contact change. Keep your details and reload saved work.", revision: null };
    } finally { admission.current = false; setBusy(false); }
  }
  return <div className="space-y-5">
    <p className="text-sm leading-6">Keep email, WhatsApp or phone details in private Working. Saving does not open a contact action or publish it.</p>
    {frozen ? <p role="alert" className="text-sm">Reload saved work to reconcile all Contact blocks before saving again. Your current inputs are retained.</p> : null}
    {blocks.map(block => <ContactForm key={block.blockId} block={block} base={base} disabled={busy || frozen} submit={(previous, form) => run(saveContactWorkingAction, previous, form)} />)}
    <ContactForm key={`new-${creationKey}`} base={base} disabled={busy || frozen} submit={(previous, form) => run(createContactWorkingAction, previous, form)} another={() => setCreationKey(value => value + 1)} />
    <div data-contact-reload><DocumentLink href="/dashboard/identity" className="text-sm underline">Reload saved Contact blocks</DocumentLink></div>
  </div>;
}
function ContactForm({ block, base, disabled, submit, another }: { block?: ContactBlock; base: number | null; disabled: boolean; submit: Operation; another?: () => void }) {
  const [type, setType] = useState(block?.contactType ?? "");
  const [label, setLabel] = useState(block?.label ?? "");
  const [value, setValue] = useState(block?.value ?? "");
  const [saved, setSaved] = useState({ type: block?.contactType ?? "", label: block?.label ?? "", value: block?.value ?? "" });
  const [state, action, pending] = useActionState(async (previous: ContactSaveState, form: FormData) => {
    const result = await submit(previous, form);
    if (result.status === "saved") setSaved({ type: String(form.get("contactType")), label: String(form.get("label")), value: String(form.get("value")) });
    return result;
  }, idle);
  const [visibility, setVisibility] = useState("true");
  const locked = disabled || pending || (!block && state.status === "saved");
  const normalize = (text: string) => text.replace(/\r\n?/g, "\n");
  const dirty = type !== saved.type || normalize(label) !== normalize(saved.label) || normalize(value) !== normalize(saved.value);
  const controls = Array.from(label + value).some(char => { const code = char.codePointAt(0)!; return code < 32 || code === 127; });
  return <form action={action} onReset={event => event.preventDefault()} aria-label={block ? "Contact Working" : "New Contact Working"} data-contact-block={block?.blockId} className="space-y-4 rounded-3xl border border-neutral-300 bg-white/60 p-6">
    <h3 className="text-xl font-semibold">{block ? `Contact · ${block.isVisible ? "Visible in Working" : "Hidden in Working"}` : "Add Contact"}</h3>
    <input type="hidden" name="collectionRevision" value={base ?? ""} />
    {block ? <input type="hidden" name="blockId" value={block.blockId} /> : null}
    {block?.missing ? <p className="text-sm">This saved Contact block has no content yet. Save details to fill it in.</p> : null}
    <label className="block text-sm font-medium">Contact type<select name="contactType" value={type} disabled={locked} onChange={event => setType(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="">Choose later</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option></select></label>
    <label className="block text-sm font-medium">Label<textarea name="label" maxLength={1024} value={label} readOnly={locked} onChange={event => setLabel(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    <label className="block text-sm font-medium">Contact value<textarea name="value" maxLength={4096} value={value} readOnly={locked} onChange={event => setValue(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3" /></label>
    {!type || !value.trim() ? <p className="text-sm">Unfinished contact details can be saved privately. Choose a type and review the value before publication.</p> : null}
    {controls ? <p className="text-sm">Control characters are retained in Working and need review before publication.</p> : null}
    {!block ? <label className="block text-sm font-medium">Working visibility<select name="visibility" value={visibility} disabled={locked} onChange={event => setVisibility(event.target.value)} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="true">Visible in Working</option><option value="false">Hidden in Working</option></select></label> : null}
    {dirty ? <p role="status" className="text-sm">You have unsaved Contact edits.</p> : null}
    {state.message && !(state.status === "saved" && dirty) ? <p role={state.status === "saved" ? "status" : "alert"} className="text-sm">{state.message}</p> : null}
    <button type="submit" disabled={locked} className="button disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Saving Contact…" : block ? "Save Contact Working" : "Add Contact to Working"}</button>
    {!block && state.status === "saved" ? <button type="button" onClick={another} disabled={disabled} className="ml-4 text-sm underline">Add another Contact block</button> : null}
  </form>;
}
