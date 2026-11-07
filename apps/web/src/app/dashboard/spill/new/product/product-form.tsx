"use client";
import { useActionState,useState } from "react";
import { DocumentLink } from "@/components/document-link";
import { createProductDraftAction,type ProductCreateState } from "./actions";
const initial:ProductCreateState={status:"idle",message:null};
export function ProductDraftForm({creationId}:{creationId:string}){
 const [intent]=useState(creationId);
 const [state,action,pending]=useActionState(createProductDraftAction,initial);
 const [title,setTitle]=useState(""),[source,setSource]=useState("");const frozen=pending||state.status==="reload";
 return <form onReset={event=>event.preventDefault()} action={action} className="space-y-6" aria-label="New Product Draft">
  <input type="hidden" name="creationId" value={intent}/>
  <label className="block font-medium">Marketplace or affiliate URL <span className="text-sm font-normal">(optional for a Draft)</span><input name="sourceUrl" value={source} onChange={e=>setSource(e.target.value)} readOnly={frozen} maxLength={32768} autoComplete="url" className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
  <label className="block font-medium">Manual Product title <span className="text-sm font-normal">(required when the source is empty)</span><input name="title" value={title} onChange={e=>setTitle(e.target.value)} readOnly={frozen} maxLength={32768} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
  <p className="text-sm leading-6">Save a title or source to start. Your Product gets a permanent reference when saved. A source is not a verified marketplace destination. Title, a primary image and a valid destination are needed before publication.</p>
  {(title!==""||source!=="")&&state.status!=="reload"?<p role="status" className="text-sm">Your Product isn’t saved yet.</p>:null}
  {state.message?<p role="alert" className="rounded-xl border border-amber-400 p-4 text-sm">{state.message}</p>:null}
  <button className="button disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={frozen}>{pending?"Saving Draft…":"Save Product Draft"}</button>
  {state.status==="reload"?<p><DocumentLink href="/dashboard/spill" className="text-sm underline">Check saved Items in Spill</DocumentLink></p>:null}
 </form>;
}

