"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction } from "./actions";
import { INITIAL_LOGIN_ACTION_STATE } from "./state";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Signing in..."
        : "Log in"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(
    loginAction,
    INITIAL_LOGIN_ACTION_STATE,
  );

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
          defaultValue={state.email}
          aria-invalid={
            state.fieldErrors.email
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.email
              ? "login-email-error"
              : undefined
          }
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />

        {state.fieldErrors.email ? (
          <p
            id="login-email-error"
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
          autoComplete="current-password"
          required
          aria-invalid={
            state.fieldErrors.password
              ? true
              : undefined
          }
          aria-describedby={
            state.fieldErrors.password
              ? "login-password-error"
              : undefined
          }
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-950 outline-none transition focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />

        {state.fieldErrors.password ? (
          <p
            id="login-password-error"
            className="text-sm text-red-700"
          >
            {state.fieldErrors.password}
          </p>
        ) : null}
      </div>

      {state.message ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {state.message}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}