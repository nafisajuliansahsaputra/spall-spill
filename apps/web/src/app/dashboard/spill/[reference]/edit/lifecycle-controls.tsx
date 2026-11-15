"use client";
import { useActionState,useEffect,useRef,useState,type ReactNode } from "react";
import { DocumentLink } from "@/components/document-link";
import type { LifecyclePage } from "@/lib/workspace/item-lifecycle-contract";
import { changeItemLifecycleAction,type LifecycleActionState } from "./lifecycle-actions";
const idle:LifecycleActionState={status:"idle",message:null,current:null};
export function ItemLifecycleControls({data,intentId,children}:{data:LifecyclePage;intentId:string;children:ReactNode}){
 const primaryButton=useRef<HTMLButtonElement>(null);
 const [initial]=useState(data),[current,setCurrent]=useState({lifecycle:data.lifecycle,revision:data.revision}),[intent,setIntent]=useState(intentId),[locked,setLocked]=useState(data.lifecycle==='archived'),[recentHide,setRecentHide]=useState(false);
 const [state,action,pending]=useActionState(async(previous:LifecycleActionState,form:FormData)=>{const result=await changeItemLifecycleAction(previous,form);if(result.status==='saved'&&result.current){setCurrent(result.current);setIntent(crypto.randomUUID());setRecentHide(form.get("action")==="hide");if(result.current.lifecycle==='archived')setLocked(true);}return result;},idle);
 useEffect(()=>{if(state.status==='saved'&&!pending)primaryButton.current?.focus();},[state.status,current.revision,pending]);
 const newer=data.reference!==initial.reference||data.kind!==initial.kind||data.current_handle!==initial.current_handle||data.primary_use_case!==initial.primary_use_case||data.revision!==initial.revision&&data.revision!==current.revision;
 const exhausted=current.revision>=Number.MAX_SAFE_INTEGER;
 const frozen=pending||newer||state.status==='reload'||exhausted;
 const fields=(operation:'hide'|'restore'|'archive')=><><input type="hidden" name="intent_id" value={intent}/><input type="hidden" name="reference" value={data.reference}/><input type="hidden" name="expected_revision" value={current.revision}/><input type="hidden" name="expected_lifecycle" value={current.lifecycle}/><input type="hidden" name="action" value={operation}/>{operation!=='archive'?<input type="hidden" name="confirmed" value="false"/>:null}</>;
 return <><section id="item-lifecycle" className="space-y-5 rounded-3xl border border-neutral-300 bg-white/60 p-6" aria-labelledby="lifecycle-heading">
  <div><p className="eyebrow">Visibility</p><h2 id="lifecycle-heading" className="mt-3 text-2xl font-semibold">{newer||state.status==='reload'?'Last confirmed: ':''}{current.lifecycle.charAt(0).toUpperCase()+current.lifecycle.slice(1)}</h2><p className="mt-3 text-sm leading-6">These actions change public visibility only. They keep the same reference and saved work; they do not publish new Working edits.</p></div>
  {exhausted?<p role="alert" className="text-sm">Visibility changes are unavailable for this Item. Contact support before trying again.</p>:null}
  {newer?<p role="alert" className="text-sm">This Item changed. Reload its saved state before acting.</p>:state.message?<p role={state.status==='saved'?'status':'alert'} className="text-sm leading-6">{state.message}</p>:null}
  <form aria-label={current.lifecycle==='published'?'Hide Item':'Restore Item'} action={action}>
   {fields(current.lifecycle==='published'?'hide':'restore')}<button ref={primaryButton} disabled={frozen} className="button disabled:opacity-50">{pending?'Updating visibility…':current.lifecycle==='published'?'Hide Item':current.lifecycle==='archived'?'Restore to Hidden':recentHide?'Undo Hide':'Restore Published version'}</button>
  </form>
  {current.lifecycle!=='archived'?<details className="rounded-2xl border border-neutral-300 p-4"><summary className="cursor-pointer text-sm font-semibold">Archive Item…</summary><form aria-label="Confirm Archive Item" action={action} className="mt-4 space-y-4">
   {fields('archive')}<p className="text-sm leading-6">Archive intentionally retires this Item. Its reference and saved Working stay reserved. Restoring an archive returns it to Hidden. Editing pauses until you reload its saved state.</p><label className="flex items-start gap-3 text-sm"><input name="confirmed" type="checkbox" value="true" required disabled={frozen} className="mt-1"/>I understand and want to archive this Item.</label><button disabled={frozen} className="button disabled:opacity-50">Confirm Archive</button><p className="text-sm">Close this panel to cancel without changing anything.</p>
  </form></details>:null}
  {locked?<p role="status" className="text-sm">Editing is paused. Reload the saved Item after restoring it to Hidden.</p>:null}
  <DocumentLink href={`/dashboard/spill/${data.reference}/edit`} className="inline-block text-sm underline">Reload saved Item</DocumentLink>
 </section><fieldset aria-label="Saved Item editing" disabled={locked||frozen} className="min-w-0 space-y-7">{children}</fieldset></>;
}
