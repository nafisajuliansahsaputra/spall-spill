"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ProductPreparation, ProductPreparationActionState } from "@/lib/onboarding/product-preparation-contract";
import { uploadProfileMediaFile } from "@/lib/profile-media/client-upload";
import { finalizeProfileMediaUploadAction, initiateProfileMediaUploadAction } from "./profile-media-actions";
import { saveProductPreparationAction } from "./product-preparation-actions";

function SaveButton({ uploading }: { uploading: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending || uploading} className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
    {pending ? "Saving..." : "Save Product preparation"}
  </button>;
}

export function ProductPreparationForm({ preparation, productRevision, sourceUrl, previewUrl }: {
  preparation: ProductPreparation | null; productRevision: number; sourceUrl: string; previewUrl: string | null;
}) {
  const [assetKey, setAssetKey] = useState(preparation?.primary_asset_key ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const initial: ProductPreparationActionState = { status: "idle", message: null, primaryAssetKey: assetKey,
    destinations: preparation ? preparation.destinations.map((destination) => destination.destination_url).join("\n") : sourceUrl };
  const [state, action, pending] = useActionState(saveProductPreparationAction, initial);
  return <section className="rounded-2xl border border-neutral-200 bg-white p-5" aria-labelledby="product-preparation-title">
    <h3 id="product-preparation-title" className="font-semibold">Prepare your Product</h3>
    <p className="mt-2 text-sm leading-6">Choose a recognizable image and marketplace destinations. Your changes stay private; nothing is published here.</p>
    {previewUrl && assetKey === preparation?.primary_asset_key ? <Image src={previewUrl} alt="Saved Product primary image" width={320} height={320} unoptimized className="mt-4 max-h-64 w-auto rounded-xl object-contain" /> : null}
    <label htmlFor="productPrimaryImage" className="mt-4 block text-sm font-medium">Primary image</label>
    <input id="productPrimaryImage" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading || pending}
      className="mt-2 block w-full text-sm" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file || uploading || pending) return;
        setUploading(true); setUploadMessage("Uploading and processing your image...");
        try {
          const result = await uploadProfileMediaFile({ file, initiate: initiateProfileMediaUploadAction, finalize: finalizeProfileMediaUploadAction });
          if (result.status === "success") { setAssetKey(result.assetKey); setUploadMessage("Image processed. Save to attach it to your Product."); }
          else setUploadMessage("The image could not be processed. Use JPEG, PNG or WebP up to 5 MiB. Your saved image is unchanged.");
        } catch { setUploadMessage("The image could not be processed. Your saved image is unchanged."); }
        finally { setUploading(false); }
      }} />
    <p role="status" className="mt-2 text-sm">{uploadMessage ?? (assetKey ? "A saved image is selected." : "No image selected yet. You can keep preparing this Draft.")}</p>
    {assetKey ? <button type="button" disabled={uploading || pending} className="mt-2 text-sm underline" onClick={() => { setAssetKey(""); setUploadMessage("Image selection removed locally. Save to confirm."); }}>Remove image selection</button> : null}
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="baseProductRevision" value={productRevision} />
      <input type="hidden" name="basePreparationRevision" value={preparation?.revision ?? ""} />
      <input type="hidden" name="productPrimaryAssetKey" value={assetKey} />
      <label htmlFor="marketplaceDestinations" className="block text-sm font-medium">Marketplace destinations</label>
      <textarea id="marketplaceDestinations" name="marketplaceDestinations" defaultValue={state.destinations} rows={3}
        aria-describedby="marketplaceDestinationsHelp" className="block w-full rounded-xl border border-neutral-300 p-3 text-sm" />
      <p id="marketplaceDestinationsHelp" className="text-sm">One link per line and one per marketplace. Additional destinations are optional. Unknown marketplaces keep their website context; links still need safety checks.</p>
      {state.message ? <p role="alert" className="text-sm text-red-700">{state.message}</p> : null}
      <SaveButton uploading={uploading} />
    </form>
  </section>;
}
