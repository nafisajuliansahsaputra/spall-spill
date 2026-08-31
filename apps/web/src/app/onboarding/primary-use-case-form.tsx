"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { setPrimaryUseCaseAction } from "./actions";
import type { PrimaryUseCaseActionState } from "./state";

type PrimaryUseCaseFormProps = {
  initialPrimaryUseCase: string | null;
  baseRevision: number;
};

const OPTIONS = [
  {
    value: "creator",
    title: "Creator",
    description:
      "Build your public identity, social presence, and featured connections.",
  },
  {
    value: "affiliate",
    title:
      "Affiliate / Product Recommendations",
    description:
      "Start with your identity and make product recommendations easier to add later.",
  },
  {
    value: "business",
    title: "Business / UMKM",
    description:
      "Start with your brand identity and useful business or resource destinations.",
  },
  {
    value: "personal",
    title: "Personal Link-in-Bio",
    description:
      "Create a clean personal identity with the links that matter to you.",
  },
  {
    value: "other",
    title: "Other",
    description:
      "Start with a neutral setup without choosing a specific direction.",
  },
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Saving choice..."
        : "Continue"}
    </button>
  );
}

export function PrimaryUseCaseForm({
  initialPrimaryUseCase,
  baseRevision,
}: PrimaryUseCaseFormProps) {
  const initialState: PrimaryUseCaseActionState =
    {
      status: "idle",
      message: null,
      primaryUseCase:
        initialPrimaryUseCase ?? "",
      fieldErrors: {},
    };

  const [state, formAction] =
    useActionState(
      setPrimaryUseCaseAction,
      initialState,
    );

  const selectedValue =
    state.primaryUseCase ||
    initialPrimaryUseCase ||
    "";

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="baseRevision"
        value={baseRevision}
      />

      <fieldset
        aria-describedby={
          state.fieldErrors.primaryUseCase
            ? "primary-use-case-error"
            : undefined
        }
        className="space-y-3"
      >
        <legend className="sr-only">
          Primary Use Case
        </legend>

        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400"
          >
            <input
              type="radio"
              name="primaryUseCase"
              value={option.value}
              required
              defaultChecked={
                selectedValue ===
                option.value
              }
              className="mt-1 h-4 w-4 accent-neutral-950"
            />

            <span className="space-y-1">
              <span className="block text-sm font-semibold text-neutral-950">
                {option.title}
              </span>

              <span className="block text-sm leading-6 text-neutral-600">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {state.fieldErrors.primaryUseCase ? (
        <p
          id="primary-use-case-error"
          className="text-sm text-red-700"
        >
          {
            state.fieldErrors
              .primaryUseCase
          }
        </p>
      ) : null}

      {state.message ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
        >
          {state.message}
        </div>
      ) : null}

      <SubmitButton />

      <p className="text-center text-xs leading-5 text-neutral-500">
        This choice personalizes guidance
        only. It does not limit which Spall
        Spill features you can use.
      </p>
    </form>
  );
}