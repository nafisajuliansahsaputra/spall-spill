"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  STARTER_KEYS,
} from "@/lib/onboarding/validation";

import {
  saveStarterCompositionAction,
} from "./actions";
import type {
  StarterCompositionActionState,
} from "./state";

type StarterKey =
  (typeof STARTER_KEYS)[number];

type StarterCompositionFormProps = {
  initialStarterKey: StarterKey | null;
  baseLayoutRevision: number | null;
  baseProgressRevision: number;
  primaryUseCase: string | null;
  isFrontier: boolean;
};

const OPTIONS: ReadonlyArray<{
  value: StarterKey;
  title: string;
  description: string;
}> = [
  {
    value: "clean",
    title: "Clean",
    description:
      "A neutral profile-first composition with a simple, minimal hierarchy.",
  },
  {
    value: "social_focus",
    title: "Social Focus",
    description:
      "A composition that gives more emphasis to your Identity and social or link-oriented content.",
  },
  {
    value: "featured",
    title: "Featured",
    description:
      "A stronger visual hierarchy for creators and future featured or Spill-oriented content.",
  },
  {
    value: "business",
    title: "Business",
    description:
      "A business-oriented composition for Identity, contact, and future resource-oriented content.",
  },
];

function getRecommendedStarter(
  primaryUseCase: string | null,
): StarterKey | null {
  switch (primaryUseCase) {
    case "creator":
    case "affiliate":
      return "featured";

    case "business":
      return "business";

    case "personal":
      return "social_focus";

    case "other":
      return "clean";

    default:
      return null;
  }
}

function StarterPreview({
  starterKey,
}: {
  starterKey: StarterKey;
}) {
  if (starterKey === "featured") {
    return (
      <div
        aria-hidden="true"
        className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-neutral-300" />
          <div className="space-y-1">
            <div className="h-2 w-16 rounded-full bg-neutral-300" />
            <div className="h-1.5 w-10 rounded-full bg-neutral-200" />
          </div>
        </div>

        <div className="mb-2 h-14 rounded-lg bg-neutral-300" />

        <div className="grid grid-cols-2 gap-2">
          <div className="h-7 rounded-lg bg-neutral-200" />
          <div className="h-7 rounded-lg bg-neutral-200" />
        </div>
      </div>
    );
  }

  if (starterKey === "social_focus") {
    return (
      <div
        aria-hidden="true"
        className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-neutral-300" />
          <div className="h-2 w-16 rounded-full bg-neutral-300" />
        </div>

        <div className="mb-3 flex gap-1.5">
          <div className="h-5 w-12 rounded-full bg-neutral-200" />
          <div className="h-5 w-12 rounded-full bg-neutral-200" />
          <div className="h-5 w-10 rounded-full bg-neutral-200" />
        </div>

        <div className="space-y-2">
          <div className="h-7 rounded-lg bg-neutral-200" />
          <div className="h-7 rounded-lg bg-neutral-200" />
        </div>
      </div>
    );
  }

  if (starterKey === "business") {
    return (
      <div
        aria-hidden="true"
        className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-neutral-300" />
            <div className="h-2 w-16 rounded-full bg-neutral-300" />
          </div>

          <div className="h-5 w-12 rounded-full bg-neutral-200" />
        </div>

        <div className="mb-2 h-8 rounded-lg bg-neutral-200" />

        <div className="grid grid-cols-2 gap-2">
          <div className="h-7 rounded-lg bg-neutral-200" />
          <div className="h-7 rounded-lg bg-neutral-200" />
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
    >
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-neutral-300" />
        <div className="h-2 w-16 rounded-full bg-neutral-300" />
        <div className="h-1.5 w-24 rounded-full bg-neutral-200" />
      </div>

      <div className="space-y-2">
        <div className="h-7 rounded-lg bg-neutral-200" />
        <div className="h-7 rounded-lg bg-neutral-200" />
      </div>
    </div>
  );
}

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

export function StarterCompositionForm({
  initialStarterKey,
  baseLayoutRevision,
  baseProgressRevision,
  primaryUseCase,
  isFrontier,
}: StarterCompositionFormProps) {
  const initialState:
    StarterCompositionActionState = {
      status: "idle",
      message: null,
      starterKey:
        initialStarterKey ?? "",
      fieldErrors: {},
    };

  const [state, formAction] =
    useActionState(
      saveStarterCompositionAction,
      initialState,
    );

  const selectedValue =
    state.starterKey ||
    initialStarterKey ||
    "";

  const recommendedStarter =
    getRecommendedStarter(
      primaryUseCase,
    );

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <input
        type="hidden"
        name="baseLayoutRevision"
        value={
          baseLayoutRevision ?? ""
        }
      />

      <input
        type="hidden"
        name="baseProgressRevision"
        value={baseProgressRevision}
      />

      <fieldset
        aria-describedby={
          state.fieldErrors.starterKey
            ? "starter-composition-error"
            : undefined
        }
        className="grid gap-3 sm:grid-cols-2"
      >
        <legend className="sr-only">
          Starter Composition
        </legend>

        {OPTIONS.map((option) => {
          const isRecommended =
            recommendedStarter ===
            option.value;

          const isSaved =
            initialStarterKey ===
            option.value;

          return (
            <label
              key={option.value}
              className="group relative block cursor-pointer"
            >
              <input
                type="radio"
                name="starterKey"
                value={option.value}
                required
                defaultChecked={
                  selectedValue ===
                  option.value
                }
                className="peer sr-only"
              />

              <span className="block h-full rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400 peer-checked:border-neutral-950 peer-checked:ring-1 peer-checked:ring-neutral-950 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-950 peer-focus-visible:ring-offset-2">
                <span className="mb-3 flex min-h-6 flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-neutral-950">
                    {option.title}
                  </span>

                  <span className="flex flex-wrap justify-end gap-1.5">
                    {isSaved ? (
                      <span className="rounded-full bg-neutral-950 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Saved
                      </span>
                    ) : null}

                    {isRecommended ? (
                      <span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-700">
                        Recommended
                      </span>
                    ) : null}
                  </span>
                </span>

                <StarterPreview
                  starterKey={
                    option.value
                  }
                />

                <span className="mt-3 block text-sm leading-6 text-neutral-600">
                  {option.description}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {state.fieldErrors.starterKey ? (
        <p
          id="starter-composition-error"
          className="text-sm text-red-700"
        >
          {
            state.fieldErrors
              .starterKey
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

      <SubmitButton
        isFrontier={isFrontier}
      />

      <p className="text-center text-xs leading-5 text-neutral-500">
        Starter Composition changes
        layout emphasis only. It does
        not publish anything, create
        content, or restrict which
        Spall Spill features you can
        use.
      </p>
    </form>
  );
}