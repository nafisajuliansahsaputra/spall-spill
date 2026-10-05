import Image from "next/image";
import { publicProductPayloadSchema } from "./product-contract";

/** Staged recognition region; public routing and marketplace actions are withheld. */
export function PublishedProductConfirmation({ payload }: { payload: unknown }) {
  const parsed = publicProductPayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.status !== "success") {
    return <section aria-label="Product unavailable" className="mx-auto max-w-3xl p-5">
      <h1 className="text-2xl font-semibold">Unavailable</h1>
      <p className="mt-2">This item is not available.</p>
    </section>;
  }

  const product = parsed.data;
  return <article aria-label="Product confirmation" className="mx-auto max-w-3xl space-y-5 p-5">
    <nav aria-label="Creator navigation" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <a href={`/${product.current_handle}`} className="underline">
        {product.display_name} <span>@{product.current_handle}</span>
      </a>
      <a href={`/${product.current_handle}/spill`} className="underline">Browse Spill</a>
    </nav>
    <p className="font-semibold">Product #{product.spill_reference}</p>
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100">
      <Image src={product.primary_image_path} alt={product.title} fill unoptimized
        sizes="(max-width: 768px) 100vw, 728px" className="object-contain" />
    </div>
    <h1 className="break-words text-2xl font-semibold">{product.title}</h1>
    {product.destinations.every((destination) => !destination.available)
      ? <p role="status">Marketplace destinations are temporarily unavailable.</p> : null}
  </article>;
}
