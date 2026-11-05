"use client";
import { useActionState,useState } from "react";
import { RESOURCE_TYPES } from "@/lib/onboarding/resource-draft-contract";
import { saveStarterItemAction,type ItemSaveState } from "./actions";
const initial:ItemSaveState={status:"idle",message:null,revision:null};
export function StarterItemForm({reference,kind,title,sourceUrl,resourceType,sourceRevision,workingRevision}:{reference:number;kind:"product"|"resource";title:string|null;sourceUrl:string|null;resourceType:string|null;sourceRevision:number;workingRevision:number|null}){
 const [name,setName]=useState(title??"");const [url,setUrl]=useState(sourceUrl??"");const [type,setType]=useState(resourceType??"");
 const [saved,setSaved]=useState({name:title??"",url:sourceUrl??"",type:resourceType??""});
 const [state,action,pending]=useActionState(async(previous:ItemSaveState,form:FormData)=>{const result=await saveStarterItemAction(previous,form);
  if(result.status==="saved")setSaved({name:String(form.get("title")),url:String(form.get("sourceUrl")),type:String(form.get("resourceType"))});return result;},initial);
 const normalize=(value:string)=>value.replace(/\r\n?/g,"\n");const dirty=normalize(name)!==normalize(saved.name)||normalize(url)!==normalize(saved.url)||type!==saved.type;
 return <form aria-label="Item Working" action={action} className="space-y-5">
  <input type="hidden" name="reference" value={reference}/><input type="hidden" name="sourceRevision" value={sourceRevision}/><input type="hidden" name="workingRevision" value={state.revision??workingRevision??""}/>
  <label className="block text-sm font-medium">Title<textarea name="title" value={name} onChange={event=>setName(event.target.value)} readOnly={pending} maxLength={32768} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
  {kind==="resource"?<label className="block text-sm font-medium">Resource meaning<select name="resourceType" value={type} onChange={event=>setType(event.target.value)} disabled={pending} className="mt-2 block w-full rounded-xl border border-neutral-300 bg-white p-3">{RESOURCE_TYPES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>:<input type="hidden" name="resourceType" value=""/>}
  <label className="block text-sm font-medium">Source URL<textarea name="sourceUrl" value={url} onChange={event=>setUrl(event.target.value)} readOnly={pending} maxLength={32768} className="mt-2 block min-h-28 w-full rounded-xl border border-neutral-300 bg-white p-3"/></label>
  <p className="text-sm leading-6 text-neutral-600">Unfinished text stays in Working. Saving does not open this URL or publish these changes.</p>
  {dirty?<p role="status" className="text-sm">You have unsaved edits.</p>:null}
  {state.message&&!(state.status==="saved"&&dirty)?<p role={state.status==="saved"?"status":"alert"} className="text-sm leading-6">{state.message}</p>:null}
  <button className="button" type="submit" disabled={pending||state.status==="reload"}>{pending?"Saving Working…":"Save Working"}</button>
  <a className="ml-4 text-sm underline" href={`/dashboard/spill/${reference}/edit`}>Reload saved work</a>
 </form>;
}
