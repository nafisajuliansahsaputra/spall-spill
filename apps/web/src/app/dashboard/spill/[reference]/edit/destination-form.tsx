"use client";
import { useActionState,useState } from "react";
import { DocumentLink } from "@/components/document-link";
import type { ProductDestinationsPage } from "@/lib/workspace/product-destinations";
import { saveProductDestinationsAction,type DestinationSaveState } from "./destination-actions";
const idle:DestinationSaveState={status:"idle",message:null,revision:null};
export function ProductDestinationsForm({data}:{data:ProductDestinationsPage}){
 const [initial]=useState(data);const [ackRevision,setAckRevision]=useState(data.preparation_revision);const [value,setValue]=useState(data.destinations.map(row=>row.destination_url).join("\n"));const [saved,setSaved]=useState(value);
 const [state,action,pending]=useActionState(async(previous:DestinationSaveState,form:FormData)=>{const result=await saveProductDestinationsAction(previous,form);if(result.status==="saved"){setSaved(String(form.get("destinations")));setAckRevision(result.revision);}return result;},idle);
 const current=ackRevision;
 const newer=data.reference!==initial.reference||data.source_revision!==initial.source_revision||(data.preparation_revision!==initial.preparation_revision&&data.preparation_revision!==current);
 const frozen=pending||state.status==="reload"||newer,dirty=value.replace(/\r\n?/g,"\n")!==saved.replace(/\r\n?/g,"\n");
 return <section className="rounded-3xl border border-neutral-300 bg-white/60 p-6" aria-labelledby="product-destinations-heading">
  <h2 id="product-destinations-heading" className="text-2xl font-semibold">Marketplace destinations</h2>
  <p className="my-4 text-sm leading-6">Add, replace, remove or reorder links below. Use one link per line and one per marketplace; extra marketplaces are optional. Affiliate parameters are retained. Saving stays private and preserves your selected image.</p>
  <form aria-label="Product destinations" action={action} onReset={event=>event.preventDefault()} className="space-y-4">
   <input type="hidden" name="reference" value={initial.reference}/><input type="hidden" name="sourceRevision" value={initial.source_revision}/><input type="hidden" name="preparationRevision" value={current??""}/>
   <label className="block text-sm font-medium">Destination links<textarea name="destinations" rows={4} maxLength={32768} value={value} onChange={event=>setValue(event.target.value)} readOnly={frozen} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
   {dirty&&state.status!=="reload"?<p role="status" className="text-sm">You have unsaved destination edits.</p>:null}
   {newer?<p role="alert" className="text-sm">Saved destinations changed. Keep your links and reload before saving.</p>:state.message&&!(state.status==="saved"&&dirty)?<p role={state.status==="saved"?"status":"alert"} className="text-sm leading-6">{state.message}</p>:null}
   <button type="submit" disabled={frozen} className="button disabled:cursor-not-allowed disabled:opacity-50">{pending?"Saving destinations…":"Save destinations"}</button>
   <DocumentLink href={`/dashboard/spill/${initial.reference}/edit`} className="ml-4 text-sm underline">Reload saved destinations</DocumentLink>
  </form>
 </section>;
}
