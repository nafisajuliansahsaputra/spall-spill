import { RESOURCE_TYPES } from "@/lib/onboarding/resource-draft-contract";
import { publicResourcePayloadSchema } from "./resource-contract";

/** Staged Published recognition only; routing and source actions remain withheld. */
export function PublishedResourceRecognition({ payload }: { payload: unknown }) {
  const parsed = publicResourcePayloadSchema.safeParse(payload);
  if (!parsed.success || parsed.data.status !== "success") {
    return <section aria-label="Resource unavailable" className="mx-auto max-w-3xl p-5">
      <h1 className="text-2xl font-semibold">Unavailable</h1>
      <p className="mt-2">This item is not available.</p>
    </section>;
  }
  const resource = parsed.data;
  const label = RESOURCE_TYPES.find(([type]) => type === resource.resource_type)![1];
  return <article aria-label="Resource recognition" className="mx-auto max-w-3xl space-y-5 p-5">
    <nav aria-label="Creator navigation" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <a href={`/${resource.current_handle}`} className="break-words underline">
        {resource.display_name} <span>@{resource.current_handle}</span>
      </a>
      <a href={`/${resource.current_handle}/spill`} className="underline">Browse Spill</a>
    </nav>
    <p className="font-semibold">Resource #{resource.spill_reference}</p>
    <p>{label}</p>
    <h1 className="break-words text-2xl font-semibold">{resource.title}</h1>
    <div aria-hidden="true" className="flex aspect-video w-full items-center justify-center rounded-2xl bg-neutral-100 text-6xl font-semibold">
      {label.charAt(0)}
    </div>
    {!resource.available ? <p role="status">Resource source is temporarily unavailable.</p> : null}
  </article>;
}
