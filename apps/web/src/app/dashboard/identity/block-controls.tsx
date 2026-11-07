"use client";
import { useActionState, useRef, useState } from "react";
import { DocumentLink } from "@/components/document-link";
import { changeBlockWorkingAction, type BlockControlState } from "./block-actions";
type Block = { id: string; kind: string; visible: boolean; label: string };
const blockNames = new Map([["social", "Social"], ["generic_link", "Link"], ["text", "Text"], ["contact", "Contact"], ["media", "Media"], ["spill_cta", "Spill link"]]);
const idle: BlockControlState = { status: "idle", message: null, revision: null };
export function BlockControls({ revision, blocks }: { revision: number | null; blocks: Block[] }) {
  const [base, setBase] = useState(revision);
  const [members, setMembers] = useState(blocks);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const admission = useRef(false);
  const frozen = reload || (!busy && revision !== null && (base === null || revision > base));
  async function run(previous: BlockControlState, form: FormData): Promise<BlockControlState> {
    if (frozen || admission.current) return { status: "error", message: "Wait for the current change or reload saved work.", revision: null };
    admission.current = true; setBusy(true); setFeedback(null);
    try {
      form.set("collectionRevision", base === null ? "" : String(base));
      const result = await changeBlockWorkingAction(previous, form);
      if (result.status === "saved" && result.revision !== null) {
        setBase(result.revision); setFeedback(result.message);
        const id = String(form.get("blockId")), operation = String(form.get("operation"));
        setMembers(current => {
          if (operation === "remove") return current.filter(block => block.id !== id);
          if (operation === "show" || operation === "hide") return current.map(block => block.id === id ? { ...block, visible: operation === "show" } : block);
          const next = [...current], index = next.findIndex(block => block.id === id), neighbor = index + (operation === "up" ? -1 : 1);
          if (index >= 0 && next[index] && next[neighbor]) [next[index], next[neighbor]] = [next[neighbor]!, next[index]!];
          return next;
        });
      }
      if (result.status === "reload") setReload(true);
      return result;
    } catch {
      setReload(true);
      return { status: "reload", message: "We couldn’t confirm this block change. Reload saved work before trying again.", revision: null };
    } finally { admission.current = false; setBusy(false); }
  }
  return <section aria-labelledby="composition-heading" className="space-y-5">
    <h2 id="composition-heading" className="text-2xl font-semibold">Block composition</h2>
    <p className="text-sm leading-6">Arrange your saved blocks and choose which appear in Working. These changes need an explicit Publish to reach your audience.</p>
    {feedback ? <p role="status" className="text-sm">{feedback}</p> : null}
    {frozen ? <p role="alert" className="text-sm">Reload saved work to reconcile the block composition before changing it again.</p> : null}
    {members.length ? <ol className="space-y-4">{members.map((block, index) => <BlockRow key={block.id} block={block} base={base} first={index === 0} last={index === members.length - 1} disabled={busy || frozen} submit={run} />)}</ol> : <p className="text-sm">No blocks in Working yet. Add a Link, Text or Contact below.</p>}
    <div data-composition-reload><DocumentLink href="/dashboard/identity" className="text-sm underline">Reload saved composition</DocumentLink></div>
  </section>;
}
function BlockRow({ block, base, first, last, disabled, submit }: { block: Block; base: number | null; first: boolean; last: boolean; disabled: boolean; submit: typeof changeBlockWorkingAction }) {
  const [state, action, pending] = useActionState(submit, idle);
  return <li className="rounded-3xl border border-neutral-300 bg-white/60 p-6" data-composition-block={block.id}>
    <h3 className="font-semibold">{blockNames.get(block.kind) ?? "Block"} · {block.visible ? "Visible in Working" : "Hidden in Working"}</h3>
    <p className="my-3 whitespace-pre-wrap break-all text-sm">{block.label}</p>
    <form action={action} aria-label="Block composition controls" className="flex flex-wrap gap-3">
      <input type="hidden" name="blockId" value={block.id} /><input type="hidden" name="collectionRevision" value={base ?? ""} />
      <button name="operation" value="up" disabled={disabled || pending || first} className="min-h-11 px-2 text-sm underline disabled:opacity-40">Move up</button>
      <button name="operation" value="down" disabled={disabled || pending || last} className="min-h-11 px-2 text-sm underline disabled:opacity-40">Move down</button>
      <button name="operation" value={block.visible ? "hide" : "show"} disabled={disabled || pending} className="min-h-11 px-2 text-sm underline disabled:opacity-40">{block.visible ? "Hide in Working" : "Show in Working"}</button>
    </form>
    <details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm">Remove from Working…</summary>
      <form action={action} aria-label="Remove block from Working" className="mt-3 space-y-3">
        <input type="hidden" name="blockId" value={block.id} /><input type="hidden" name="collectionRevision" value={base ?? ""} /><input type="hidden" name="operation" value="remove" />
        <p className="text-sm">This removes this block and its saved Working content. Unsaved edits to this block will be lost. Your published Identity stays as it is.</p>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="confirmRemoval" value="true" required disabled={disabled || pending} />I confirm removal from Working.</label>
        <button className="min-h-11 px-2 text-sm underline disabled:opacity-40" disabled={disabled || pending}>Remove block from Working</button>
      </form>
    </details>
    {state.message && state.status !== "saved" ? <p role="alert" className="mt-3 text-sm">{state.message}</p> : null}
  </li>;
}
