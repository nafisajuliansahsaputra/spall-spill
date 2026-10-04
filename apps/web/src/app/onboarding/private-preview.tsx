"use client";

import { useState } from "react";
import Link from "next/link";
import type { OnboardingPreview } from "@/lib/onboarding/preview-contract";

const ISSUE_COPY = {
  title_missing: "Add a title people can recognize.",
  source_missing: "Add a Resource URL.",
  source_not_safe: "This source has not passed the current safety check.",
  identity_reservation_missing: "This Draft could not be verified. Reload before continuing.",
  connection_not_safe: "Your social or link destination has not passed the current safety check.",
  profile_media_publication_pending: "Your photo is available privately. Publishing this photo is not ready yet.",
} as const;

function ItemReview({ label, draft }: {
  label: "Product" | "Resource";
  draft: NonNullable<OnboardingPreview["product_draft"]> | NonNullable<OnboardingPreview["resource_draft"]>;
}) {
  return <section className="rounded-2xl border border-neutral-200 bg-white p-5" aria-label={`${label} review`}>
    <h3 className="font-semibold">{label} Draft{draft.spill_reference ? ` #${draft.spill_reference}` : ""}</h3>
    <p className="mt-2 break-words text-sm">{draft.title ?? "Untitled Draft"}</p>
    {draft.validation_issues.length ? <>
      <ul className="my-3 space-y-1 text-sm text-amber-900">
        {draft.validation_issues.map((issue) => <li key={issue}>{ISSUE_COPY[issue]}</li>)}
      </ul>
      <Link href="/onboarding?step=relevant_first_job" className="text-sm font-medium underline">Fix {label}</Link>
      <p className="mt-3 text-xs leading-5 text-neutral-600">You will be able to choose Identity only at Publish. This Draft will stay saved privately.</p>
    </> : <p className="mt-3 text-sm text-emerald-800">Ready for your publication review. Safety is checked again at Publish.</p>}
  </section>;
}

export function PrivateOnboardingPreview({ preview, profileUrl }: { preview: OnboardingPreview; profileUrl: string | null }) {
  const [mode, setMode] = useState<"desktop" | "mobile">("mobile");
  const identity = preview.identity_working;
  const connection = preview.connection_working;
  const items = [preview.product_draft, preview.resource_draft].filter((item) => item !== null);
  return <div className="space-y-5">
    <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6">Private preview. Review what people will see before your first publication. Nothing on this screen is public yet.</p>
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="mb-2 text-sm font-medium">Preview size</legend>
      {(["mobile", "desktop"] as const).map((value) => <label key={value} className="flex items-center gap-2 text-sm capitalize">
        <input type="radio" name="previewSize" value={value} checked={mode === value} onChange={() => setMode(value)} />{value}
      </label>)}
    </fieldset>
    <section aria-label="Private Identity preview" className={`mx-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm ${mode === "mobile" ? "w-full max-w-sm" : "w-full"}`}>
      <div className={preview.layout_working.starter_key === "business" ? "space-y-4 text-left" : "space-y-4 text-center"}>
        {profileUrl ? <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-full">
          {/* Private short-lived signed media; never optimized or exposed as public media. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={profileUrl} alt={`${identity.display_name} profile photo`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        </div> : identity.profile_asset_key ? <p className="text-xs text-neutral-500">Photo preview is temporarily unavailable.</p> : null}
        <h2 className="break-words text-2xl font-semibold tracking-tight">{identity.display_name}</h2>
        <p className="text-sm text-neutral-500">@{preview.current_handle}</p>
        {identity.bio ? <p className="whitespace-pre-line break-words text-sm leading-6 text-neutral-700">{identity.bio}</p> : null}
        {connection ? <div className="rounded-xl border border-neutral-200 px-4 py-3 text-sm">
          <p>{connection.social_platform ?? "Your link"}</p>
          <p className="mt-1 break-all text-xs text-neutral-500">{connection.destination_url}</p>
          <p className="mt-1 text-xs text-neutral-500">Preview only · {connection.safety.status === "safe" ? "Safety checked" : "Safety check needed"}</p>
        </div> : null}
        {items.length ? <p className="text-xs leading-5 text-neutral-500">Your saved Items appear in the review below. A public Spill link will appear only for content included in a successful Publish.</p> : null}
      </div>
    </section>
    <Link href="/onboarding?step=basic_identity" className="inline-block text-sm font-medium underline">Edit Identity</Link>
    {preview.identity_validation_issues.length ? <section aria-label="Identity review issues" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="mb-2 text-sm font-semibold">Check your Identity</h3>
      <ul className="space-y-1 text-sm leading-6 text-amber-950">{preview.identity_validation_issues.map((issue) => <li key={issue}>{ISSUE_COPY[issue]}</li>)}</ul>
      {preview.identity_validation_issues.includes("connection_not_safe") ? <Link href="/onboarding?step=relevant_first_job" className="mt-2 inline-block text-sm underline">Fix social or link</Link> : null}
    </section> : null}
    {preview.product_draft ? <ItemReview label="Product" draft={preview.product_draft} /> : null}
    {preview.resource_draft ? <ItemReview label="Resource" draft={preview.resource_draft} /> : null}
    <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6">Your work is saved privately. First publication is being completed; you can keep reviewing and editing your setup.</p>
  </div>;
}
