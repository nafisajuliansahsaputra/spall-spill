"use client";

import {
  useActionState,
  useState,
} from "react";
import {
  useFormStatus,
} from "react-dom";

import {
  saveIdentityConnectionAction,
} from "./actions";
import type {
  IdentityConnectionActionState,
} from "./state";

type IdentityConnectionKind =
  | "social"
  | "generic_link";

type IdentityConnectionFormProps = {
  initialConnectionKind:
    IdentityConnectionKind | null;
  initialSocialPlatform:
    string | null;
  initialDestinationUrl: string;
  baseConnectionRevision:
    number | null;
};

function SaveConnectionButton() {
  const { pending } =
    useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl border border-neutral-950 bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Saving..."
        : "Save connection"}
    </button>
  );
}

export function IdentityConnectionForm({
  initialConnectionKind,
  initialSocialPlatform,
  initialDestinationUrl,
  baseConnectionRevision,
}: IdentityConnectionFormProps) {
  const initialKind =
    initialConnectionKind ??
    "social";

  const [
    connectionKind,
    setConnectionKind,
  ] = useState<
    IdentityConnectionKind
  >(initialKind);

  const initialState:
    IdentityConnectionActionState = {
      status: "idle",
      message: null,
      connectionKind: initialKind,
      socialPlatform:
        initialSocialPlatform ?? "",
      destinationUrl:
        initialDestinationUrl,
      fieldErrors: {},
    };

  const [state, formAction] =
    useActionState(
      saveIdentityConnectionAction,
      initialState,
    );

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-5 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
          Identity connection
        </p>

        <h3 className="text-base font-semibold text-neutral-950">
          Add a social or link
        </h3>

        <p className="text-sm leading-6 text-neutral-600">
          Optional for every setup.
          Save a connection privately,
          then continue when you are ready
          to review your Identity.
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-4"
      >
        <input
          type="hidden"
          name="baseConnectionRevision"
          value={
            baseConnectionRevision ??
            ""
          }
        />

        <div>
          <label
            htmlFor="connectionKind"
            className="mb-1.5 block text-sm font-medium text-neutral-800"
          >
            Type
          </label>

          <select
            id="connectionKind"
            name="connectionKind"
            value={connectionKind}
            onChange={(event) => {
              setConnectionKind(
                event.target.value as
                  IdentityConnectionKind,
              );
            }}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm text-neutral-950 outline-none transition focus:border-neutral-950"
          >
            <option value="social">
              Social
            </option>

            <option value="generic_link">
              Generic Link
            </option>
          </select>

          {state.fieldErrors
            .connectionKind ? (
            <p className="mt-1.5 text-xs text-red-700">
              {
                state.fieldErrors
                  .connectionKind
              }
            </p>
          ) : null}
        </div>

        {connectionKind ===
        "social" ? (
          <div>
            <label
              htmlFor="socialPlatform"
              className="mb-1.5 block text-sm font-medium text-neutral-800"
            >
              Platform
            </label>

            <input
              id="socialPlatform"
              name="socialPlatform"
              type="text"
              defaultValue={
                state.socialPlatform
              }
              placeholder="instagram"
              autoComplete="off"
              className="w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
            />

            <p className="mt-1.5 text-xs leading-5 text-neutral-500">
              Use a short platform key,
              for example instagram,
              tiktok, youtube, x, or
              linkedin.
            </p>

            {state.fieldErrors
              .socialPlatform ? (
              <p className="mt-1.5 text-xs text-red-700">
                {
                  state.fieldErrors
                    .socialPlatform
                }
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label
            htmlFor="destinationUrl"
            className="mb-1.5 block text-sm font-medium text-neutral-800"
          >
            Destination URL
          </label>

          <input
            id="destinationUrl"
            name="destinationUrl"
            type="url"
            defaultValue={
              state.destinationUrl
            }
            placeholder="https://..."
            autoComplete="url"
            className="w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
          />

          <p className="mt-1.5 text-xs leading-5 text-neutral-500">
            Only normal http:// or
            https:// destinations are
            accepted.
          </p>

          {state.fieldErrors
            .destinationUrl ? (
            <p className="mt-1.5 text-xs text-red-700">
              {
                state.fieldErrors
                  .destinationUrl
              }
            </p>
          ) : null}
        </div>

        {state.status === "error" &&
        state.message ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
          >
            {state.message}
          </p>
        ) : null}

        <SaveConnectionButton />
      </form>
    </div>
  );
}
