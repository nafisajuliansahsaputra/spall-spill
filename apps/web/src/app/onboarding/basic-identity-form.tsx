"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { saveBasicIdentityAction } from "./actions";
import type { BasicIdentityActionState } from "./state";

type BasicIdentityFormProps = {
  initialDisplayName: string;
  initialBio: string | null;
  baseIdentityRevision: number | null;
  baseProgressRevision: number;
  isFrontier: boolean;
};

function SubmitButton({
  isFrontier,
}: {
  isFrontier: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Saving Working..."
        : isFrontier
          ? "Continue"
          : "Save changes"}
    </button>
  );
}

export function BasicIdentityForm({
  initialDisplayName,
  initialBio,
  baseIdentityRevision,
  baseProgressRevision,
  isFrontier,
}: BasicIdentityFormProps) {
  const initialState: BasicIdentityActionState =
    {
      status: "idle",
      message: null,
      displayName: initialDisplayName,
      bio: initialBio ?? "",
      fieldErrors: {},
    };

  const [state, formAction] =
    useActionState(
      saveBasicIdentityAction,
      initialState,
    );

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="baseIdentityRevision"
        value={
          baseIdentityRevision ?? ""
        }
      />

      <input
        type="hidden"
        name="baseProgressRevision"
        value={baseProgressRevision}
      />

      <div className="space-y-2">
        <label
          htmlFor="displayName"
          className="block text-sm font-medium text-neutral-900"
        >
          Display Name
        </label>

        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          autoComplete="name"
          defaultValue={state.displayName}
          aria-invalid={
            state.fieldErrors.displayName
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.displayName
              ? "display-name-help display-name-error"
              : "display-name-help"
          }
          placeholder="Your name or brand"
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />

        <p
          id="display-name-help"
          className="text-sm leading-6 text-neutral-500"
        >
          Required. Up to 80
          characters. This is separate
          from your Handle.
        </p>

        {state.fieldErrors.displayName ? (
          <p
            id="display-name-error"
            className="text-sm text-red-700"
          >
            {
              state.fieldErrors
                .displayName
            }
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="bio"
          className="block text-sm font-medium text-neutral-900"
        >
          Bio{" "}
          <span className="font-normal text-neutral-500">
            (optional)
          </span>
        </label>

        <textarea
          id="bio"
          name="bio"
          rows={5}
          defaultValue={state.bio}
          aria-invalid={
            state.fieldErrors.bio
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.bio
              ? "bio-help bio-error"
              : "bio-help"
          }
          placeholder="A short description about you, your brand, or what people can find here."
          className="w-full resize-y rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base leading-6 text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />

        <p
          id="bio-help"
          className="text-sm leading-6 text-neutral-500"
        >
          Optional. Plain text, up to
          300 characters.
        </p>

        {state.fieldErrors.bio ? (
          <p
            id="bio-error"
            className="text-sm text-red-700"
          >
            {state.fieldErrors.bio}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-600">
        <span className="font-medium text-neutral-900">
          Photo or logo is optional.
        </span>{" "}
        You can continue without one
        and add it later.
      </div>

      {state.message ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
        >
          {state.message}
        </div>
      ) : null}

      <SubmitButton
        isFrontier={isFrontier}
      />

      <p className="text-center text-xs leading-5 text-neutral-500">
        Continue saves acknowledged
        Identity Working. It does not
        publish your public page.
      </p>
    </form>
  );
}