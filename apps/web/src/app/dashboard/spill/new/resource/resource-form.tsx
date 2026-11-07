"use client";
import { useActionState,useState } from "react";
import { RESOURCE_TYPES } from "@/lib/onboarding/resource-draft-contract";
import { DocumentLink } from "@/components/document-link";
import { createResourceDraftAction,type ResourceCreateState } from "./actions";
const initial:ResourceCreateState={status:"idle",message:null};
export function ResourceDraftForm({creationId}:{creationId:string}){
 const [intent]=useState(creationId);
 const [state,action,pending]=useActionState(createResourceDraftAction,initial);
 const [kind,setKind]=useState(""),[title,setTitle]=useState(""),[source,setSource]=useState("");const frozen=pending||state.status==="reload";
 return <form onReset={event=>event.preventDefault()} action={action} className="space-y-6" aria-label="New Resource Draft">
  <input type="hidden" name="creationId" value={intent}/>
  <label className="block font-medium">What is this Resource?<select required name="resourceType" value={kind} onChange={e=>setKind(e.target.value)} disabled={frozen} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"><option value="" disabled>Choose its meaning</option>{RESOURCE_TYPES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label className="block font-medium">Source URL <span className="text-sm font-normal">(optional for a Draft)</span><input name="sourceUrl" value={source} onChange={e=>setSource(e.target.value)} readOnly={frozen} maxLength={32768} autoComplete="url" className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
  <label className="block font-medium">Title <span className="text-sm font-normal">(required when the source is empty)</span><input name="title" value={title} onChange={e=>setTitle(e.target.value)} readOnly={frozen} maxLength={32768} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
  <p className="text-sm leading-6">Save a title or source to start. Your Resource gets a permanent reference when saved. Its type comes from your choice, never its URL.</p>
  {(title!==""||source!=="")&&state.status!=="reload"?<p role="status" className="text-sm">Your Resource isn’t saved yet.</p>:null}
  {state.message?<p role="alert" className="rounded-xl border border-amber-400 p-4 text-sm">{state.message}</p>:null}
  <button className="button disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={frozen}>{pending?"Saving Draft…":"Save Resource Draft"}</button>
  {state.status==="reload"?<p><DocumentLink href="/dashboard/spill" className="text-sm underline">Check saved Items in Spill</DocumentLink></p>:null}
 </form>;
}
