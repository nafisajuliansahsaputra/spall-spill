"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signUpAction } from "./actions";
import { INITIAL_SIGN_UP_ACTION_STATE } from "./state";

function SubmitButton({
  confirmationPending,
}: {
  confirmationPending: boolean;
}) {
  const { pending } = useFormStatus();

  const disabled =
    pending || confirmationPending;

  let label = "Create account";

  if (pending) {
    label = "Creating account...";
  } else if (confirmationPending) {
    label = "Confirmation sent";
  }

  return (
    <button
      type="submit"
      disabled={disabled}
      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  );
}

export function SignUpForm() {
  const [state, formAction] = useActionState(
    signUpAction,
    INITIAL_SIGN_UP_ACTION_STATE,
  );

  const confirmationPending =
    state.status === "success";

  return (
    <form
      action={formAction}
      className="space-y-5"
    >
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-neutral-900"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={confirmationPending}
          defaultValue={state.email}
          aria-invalid={
            state.fieldErrors.email
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.email
              ? "signup-email-error"
              : undefined
          }
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10 disabled:bg-neutral-100"
        />

        {state.fieldErrors.email ? (
          <p
            id="signup-email-error"
            className="text-sm text-red-700"
          >
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium text-neutral-900"
        >
          Password
        </label>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={confirmationPending}
          aria-invalid={
            state.fieldErrors.password
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.password
              ? "signup-password-error"
              : "signup-password-help"
          }
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10 disabled:bg-neutral-100"
        />

        {state.fieldErrors.password ? (
          <p
            id="signup-password-error"
            className="text-sm text-red-700"
          >
            {state.fieldErrors.password}
          </p>
        ) : (
          <p
            id="signup-password-help"
            className="text-sm text-neutral-500"
          >
            Use at least 8 characters.
          </p>
        )}
      </div>

      {state.message ? (
        <div
          role={
            state.status === "error"
              ? "alert"
              : "status"
          }
          aria-live="polite"
          className={
            state.status === "success"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          }
        >
          {state.message}
        </div>
      ) : null}

      <SubmitButton
        confirmationPending={
          confirmationPending
        }
      />
    </form>
  );
}