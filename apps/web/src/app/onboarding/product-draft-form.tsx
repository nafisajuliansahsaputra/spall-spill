"use client";

import {
  useActionState,
} from "react";
import {
  useFormStatus,
} from "react-dom";

import {
  saveProductDraftAction,
} from "./actions";
import type {
  ProductDraftActionState,
} from "./state";

type ProductDraftFormProps = {
  initialSourceUrl: string;
  initialTitle: string | null;
  baseProductRevision:
    number | null;
};

function SaveProductButton() {
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
        : "Save Product Draft"}
    </button>
  );
}

export function ProductDraftForm({
  initialSourceUrl,
  initialTitle,
  baseProductRevision,
}: ProductDraftFormProps) {
  const initialState:
    ProductDraftActionState = {
      status: "idle",
      message: null,
      sourceUrl:
        initialSourceUrl,
      title:
        initialTitle ?? "",
      fieldErrors: {},
    };

  const [state, formAction] =
    useActionState(
      saveProductDraftAction,
      initialState,
    );

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-5 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
          Product Draft
        </p>

        <h3 className="text-base font-semibold text-neutral-950">
          Add your first Product
        </h3>

        <p className="text-sm leading-6 text-neutral-600">
          Paste a marketplace,
          affiliate, or Product URL.
          Saving creates private Draft
          state only. Nothing is
          published and no Spill
          Reference is created yet.
        </p>
      </div>

      <form
        action={formAction}
        className="space-y-4"
      >
        <input
          type="hidden"
          name="baseProductRevision"
          value={
            baseProductRevision ??
            ""
          }
        />

        <div>
          <label
            htmlFor="productSourceUrl"
            className="mb-1.5 block text-sm font-medium text-neutral-800"
          >
            Product URL
          </label>

          <input
            id="productSourceUrl"
            name="sourceUrl"
            type="url"
            defaultValue={
              state.sourceUrl
            }
            placeholder="https://..."
            autoComplete="url"
            required
            className="w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
          />

          <p className="mt-1.5 text-xs leading-5 text-neutral-500">
            A valid http:// or https://
            URL is enough to create the
            first private Draft.
          </p>

          {state.fieldErrors
            .sourceUrl ? (
            <p className="mt-1.5 text-xs text-red-700">
              {
                state.fieldErrors
                  .sourceUrl
              }
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="productTitle"
            className="mb-1.5 block text-sm font-medium text-neutral-800"
          >
            Title{" "}
            <span className="font-normal text-neutral-500">
              (optional)
            </span>
          </label>

          <input
            id="productTitle"
            name="title"
            type="text"
            defaultValue={
              state.title
            }
            maxLength={160}
            placeholder="Product name"
            autoComplete="off"
            className="w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-neutral-950"
          />

          <p className="mt-1.5 text-xs leading-5 text-neutral-500">
            Provider / metadata
            assistance is not active in
            this slice. You can enter the
            title manually or leave it
            empty for now.
          </p>

          {state.fieldErrors
            .title ? (
            <p className="mt-1.5 text-xs text-red-700">
              {
                state.fieldErrors.title
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

        <SaveProductButton />
      </form>
    </div>
  );
}