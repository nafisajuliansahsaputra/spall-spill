"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { RESOURCE_TYPES, type ResourceDraft, type ResourceDraftActionState } from "@/lib/onboarding/resource-draft-contract";
import { saveResourceDraftAction } from "./resource-draft-actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
    {pending ? "Saving..." : "Save Resource Draft"}
  </button>;
}

export function ResourceDraftForm({ draft }: { draft: ResourceDraft | null }) {
  const initial: ResourceDraftActionState = {
    status: "idle", message: null, resourceType: draft?.resource_type ?? "",
    sourceUrl: draft?.source_url ?? "", title: draft?.title ?? "", fieldErrors: {},
  };
  const [state, action] = useActionState(saveResourceDraftAction, initial);
  // React resets uncontrolled form controls when an action returns, including
  // validation failures. Keep the Owner's current input until save/navigation.
  const [values, setValues] = useState({ resourceType: initial.resourceType, title: initial.title, sourceUrl: initial.sourceUrl });
  const inputClass = "w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm text-neutral-950 focus:border-neutral-950";
  return <div className="rounded-2xl border border-neutral-200 bg-white p-5">
    <h3 className="text-base font-semibold text-neutral-950">Add your first Resource</h3>
    <p className="mt-2 mb-5 text-sm leading-6 text-neutral-600">Choose what you are sharing, then add a title or link. Your Draft stays private until you review and publish it.</p>
    <form action={action} className="space-y-4">
      <input type="hidden" name="baseResourceRevision" value={draft?.revision ?? ""} />
      <div>
        <label htmlFor="resourceType" className="mb-1.5 block text-sm font-medium">What is this Resource for?</label>
        <select id="resourceType" name="resourceType" required value={values.resourceType}
          onChange={(event) => setValues({ ...values, resourceType: event.target.value })} className={inputClass}
          aria-invalid={!!state.fieldErrors.resourceType} aria-describedby={state.fieldErrors.resourceType ? "resourceTypeError" : undefined}>
          <option value="" disabled>Choose a Resource type</option>
          {RESOURCE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {state.fieldErrors.resourceType ? <p id="resourceTypeError" className="mt-1 text-xs text-red-700">{state.fieldErrors.resourceType}</p> : null}
      </div>
      <div>
        <label htmlFor="resourceTitle" className="mb-1.5 block text-sm font-medium">Title</label>
        <input id="resourceTitle" name="resourceTitle" value={values.title}
          onChange={(event) => setValues({ ...values, title: event.target.value })} maxLength={160} className={inputClass}
          placeholder="A name people can recognize" aria-invalid={!!state.fieldErrors.title}
          aria-describedby={state.fieldErrors.title ? "resourceTitleError" : undefined} />
        {state.fieldErrors.title ? <p id="resourceTitleError" className="mt-1 text-xs text-red-700">{state.fieldErrors.title}</p> : null}
      </div>
      <div>
        <label htmlFor="resourceSourceUrl" className="mb-1.5 block text-sm font-medium">Resource URL</label>
        <input id="resourceSourceUrl" name="resourceSourceUrl" type="url" value={values.sourceUrl}
          onChange={(event) => setValues({ ...values, sourceUrl: event.target.value })} autoComplete="url" className={inputClass}
          placeholder="https://..." aria-invalid={!!state.fieldErrors.sourceUrl}
          aria-describedby={state.fieldErrors.sourceUrl ? "resourceSourceError" : undefined} />
        {state.fieldErrors.sourceUrl ? <p id="resourceSourceError" className="mt-1 text-xs text-red-700">{state.fieldErrors.sourceUrl}</p> : null}
      </div>
      <p className="text-xs leading-5 text-neutral-500">You can save with a title or link now and finish the other later. Cover and category are optional.</p>
      {state.message ? <p role="alert" className="text-sm text-red-700">{state.message}</p> : null}
      <SaveButton />
    </form>
  </div>;
}
