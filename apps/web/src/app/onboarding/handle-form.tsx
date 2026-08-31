"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { claimHandleAction } from "./actions";
import type { HandleActionState } from "./state";

type HandleFormProps = {
  initialHandle: string | null;
  baseRevision: number;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Saving Handle..."
        : "Continue"}
    </button>
  );
}

export function HandleForm({
  initialHandle,
  baseRevision,
}: HandleFormProps) {
  const initialState: HandleActionState = {
    status: "idle",
    message: null,
    handle: initialHandle ?? "",
    fieldErrors: {},
  };

  const [state, formAction] =
    useActionState(
      claimHandleAction,
      initialState,
    );

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

      <div className="space-y-2">
        <label
          htmlFor="handle"
          className="block text-sm font-medium text-neutral-900"
        >
          Handle
        </label>

        <input
          id="handle"
          name="handle"
          type="text"
          required
          minLength={3}
          maxLength={30}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.handle}
          aria-invalid={
            state.fieldErrors.handle
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.handle
              ? "onboarding-handle-help onboarding-handle-error"
              : "onboarding-handle-help"
          }
          placeholder="yourname"
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />

        <p
          id="onboarding-handle-help"
          className="text-sm leading-6 text-neutral-500"
        >
          3–30 characters. Use letters,
          numbers, dots, underscores, or
          hyphens. Your Handle can be
          changed later.
        </p>

        {state.fieldErrors.handle ? (
          <p
            id="onboarding-handle-error"
            className="text-sm text-red-700"
          >
            {state.fieldErrors.handle}
          </p>
        ) : null}
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

      <SubmitButton />
    </form>
  );
}