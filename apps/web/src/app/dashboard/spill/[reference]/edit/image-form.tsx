"use client";
import Image from "next/image";
import { useActionState,useState } from "react";
import { DocumentLink } from "@/components/document-link";
import { uploadProfileMediaFile } from "@/lib/profile-media/client-upload";
import type { ProductImagePage } from "@/lib/workspace/product-image";
import { initiateProductImageAction,finalizeProductImageAction,saveProductImageAction,type ImageSaveState } from "./image-actions";
const idle:ImageSaveState={status:"idle",message:null,revision:null};
export function ProductImageForm({data,previewUrl}:{data:ProductImagePage;previewUrl:string|null}){
 const [initial]=useState(data),[asset,setAsset]=useState(data.primary_asset_key??""),[saved,setSaved]=useState(data.primary_asset_key??"");
 const [base,setBase]=useState(data.preparation_revision),[uploading,setUploading]=useState(false),[uploadMessage,setUploadMessage]=useState<string|null>(null);
 const [state,action,pending]=useActionState(async(previous:ImageSaveState,form:FormData)=>{const result=await saveProductImageAction(previous,form);if(result.status==="saved"){setBase(result.revision);setSaved(String(form.get("assetKey")));}return result;},idle);
 const newer=data.reference!==initial.reference||data.source_revision!==initial.source_revision||(data.preparation_revision!==initial.preparation_revision&&data.preparation_revision!==base);
 const frozen=pending||uploading||state.status==="reload"||newer,dirty=asset!==saved;
 return <section className="rounded-3xl border border-neutral-300 bg-white/60 p-6" aria-labelledby="product-image-heading">
  <h2 id="product-image-heading" className="text-2xl font-semibold">Primary image</h2><p className="my-4 text-sm leading-6">Choose a recognizable JPEG, PNG or WebP, up to 5 MiB. Processing prepares a private image; Save selection attaches it to this Product.</p>
  {previewUrl&&asset===data.primary_asset_key?<Image src={previewUrl} alt="Saved Product primary image" width={320} height={320} unoptimized className="mb-4 max-h-64 w-auto rounded-xl object-contain"/>:null}
  {data.primary_asset_key&&!previewUrl?<p role="status" className="mb-4 text-sm">Your saved image is retained. Preview is temporarily unavailable.</p>:null}
  <label className="block text-sm font-medium">Upload Product image<input type="file" name="productImageFile" accept="image/jpeg,image/png,image/webp" disabled={frozen} className="mt-2 block w-full text-sm" onChange={async event=>{
   const file=event.target.files?.[0];if(!file||frozen)return;event.target.value="";setUploading(true);setUploadMessage("Uploading and processing your image…");
   try{const result=await uploadProfileMediaFile({file,initiate:input=>initiateProductImageAction({...input,reference:initial.reference}),finalize:uploadIntentId=>finalizeProductImageAction({reference:initial.reference,uploadIntentId})});if(result.status==="success"){setAsset(result.assetKey);setUploadMessage("Image processed. Save selection to attach it to this Product.");}else setUploadMessage("We couldn’t process this image. Your saved selection is unchanged.");}catch{setUploadMessage("We couldn’t confirm processing. Your saved selection is unchanged.");}finally{setUploading(false);}
  }}/></label>
  {uploadMessage?<p role="status" className="mt-3 text-sm">{uploadMessage}</p>:null}
  {asset?<button type="button" disabled={frozen} className="my-4 text-sm underline" onClick={()=>{setAsset("");setUploadMessage("Selection removed locally. Save selection to confirm.");}}>Remove image selection</button>:<p className="my-4 text-sm">No image selected.</p>}
  <form aria-label="Product image selection" action={action} onReset={event=>event.preventDefault()} className="mt-4 space-y-4">
   <input type="hidden" name="reference" value={initial.reference}/><input type="hidden" name="sourceRevision" value={initial.source_revision}/><input type="hidden" name="preparationRevision" value={base??""}/><input type="hidden" name="assetKey" value={asset}/>
   {dirty?<p role="status" className="text-sm">Your image selection has unsaved changes.</p>:null}
   {newer?<p role="alert" className="text-sm">Product preparation changed. Keep your selection and reload before saving.</p>:state.message&&!(state.status==="saved"&&dirty)?<p role={state.status==="saved"?"status":"alert"} className="text-sm">{state.message}</p>:null}
   <button type="submit" disabled={frozen} className="button disabled:cursor-not-allowed disabled:opacity-50">{pending?"Saving image…":"Save image selection"}</button><DocumentLink href={`/dashboard/spill/${initial.reference}/edit`} className="ml-4 text-sm underline">Reload saved media</DocumentLink>
  </form>
 </section>;
}
