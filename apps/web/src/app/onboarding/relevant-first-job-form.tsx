"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ResourceDraft } from "@/lib/onboarding/resource-draft-contract";
import { ResourceDraftForm } from "./resource-draft-form";

import {
  advanceRelevantFirstJobAction,
} from "./actions";
import {
  IdentityConnectionForm,
} from "./identity-connection-form";
import {
  ProductDraftForm,
} from "./product-draft-form";
import type {
  RelevantFirstJobActionState,
} from "./state";

type RelevantFirstJobRecommendation =
  | "identity_connection"
  | "product"
  | "resource"
  | "neutral";

type RelevantFirstJobFormProps = {
  initialResourceDraft: ResourceDraft | null;
  recommendation:
    RelevantFirstJobRecommendation;
  baseProgressRevision: number;
  initialConnectionKind:
    | "social"
    | "generic_link"
    | null;
  initialSocialPlatform:
    string | null;
  initialDestinationUrl: string;
  baseConnectionRevision:
    number | null;
  initialProductSourceUrl: string;
  initialProductTitle:
    string | null;
  baseProductRevision:
    number | null;
};

const RECOMMENDATION_COPY: Record<
  RelevantFirstJobRecommendation,
  {
    title: string;
    description: string;
  }
> = {
  identity_connection: {
    title: "Add a social or link",
    description:
      "Start by connecting one place people can reach or recognize you. You can also skip this and continue with Identity only.",
  },
  product: {
    title: "Add your first Product",
    description:
      "Start with a Product you'd like to recommend. You can save it privately now or skip and continue with your Identity.",
  },
  resource: {
    title: "Add your first Resource",
    description:
      "Your Business setup recommends starting with a Resource such as a menu, catalog, PDF, portfolio, or another destination.",
  },
  neutral: {
    title: "Choose your first useful addition",
    description:
      "You can start with a social or link, Product, Resource, or continue without adding anything yet.",
  },
};

function ContinueButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Continuing..."
        : "Continue"}
    </button>
  );
}

function SkipButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending
        ? "Continuing..."
        : "Skip for now"}
    </button>
  );
}

export function RelevantFirstJobForm({
  initialResourceDraft,
  recommendation,
  baseProgressRevision,
  initialConnectionKind,
  initialSocialPlatform,
  initialDestinationUrl,
  baseConnectionRevision,
  initialProductSourceUrl,
  initialProductTitle,
  baseProductRevision,
}: RelevantFirstJobFormProps) {
  const initialState:
    RelevantFirstJobActionState = {
      status: "idle",
      message: null,
    };

  const [state, formAction] =
    useActionState(
      advanceRelevantFirstJobAction,
      initialState,
    );

  const copy =
    RECOMMENDATION_COPY[
      recommendation
    ];

  const resourceForm = <ResourceDraftForm draft={initialResourceDraft} />;
  const optionalResource = <details open={initialResourceDraft !== null} className="rounded-2xl border border-neutral-200 bg-white p-5">
    <summary className="cursor-pointer text-sm font-semibold text-neutral-950">
      {initialResourceDraft ? "Your saved Resource Draft" : "Add a Resource (optional)"}
    </summary>
    <div className="mt-4">{resourceForm}</div>
  </details>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
          Recommended next
        </p>

        <h2 className="text-lg font-semibold tracking-tight text-neutral-950">
          {copy.title}
        </h2>

        <p className="mt-2 text-sm leading-6 text-neutral-600">
          {copy.description}
        </p>
      </div>

      {recommendation === "resource" ? resourceForm : null}

      {recommendation ===
      "product" ? (
        <>
          <ProductDraftForm
            initialSourceUrl={
              initialProductSourceUrl
            }
            initialTitle={
              initialProductTitle
            }
            baseProductRevision={
              baseProductRevision
            }
          />

          <IdentityConnectionForm
            initialConnectionKind={
              initialConnectionKind
            }
            initialSocialPlatform={
              initialSocialPlatform
            }
            initialDestinationUrl={
              initialDestinationUrl
            }
            baseConnectionRevision={
              baseConnectionRevision
            }
          />
        </>
      ) : (
        <>
          <IdentityConnectionForm
            initialConnectionKind={
              initialConnectionKind
            }
            initialSocialPlatform={
              initialSocialPlatform
            }
            initialDestinationUrl={
              initialDestinationUrl
            }
            baseConnectionRevision={
              baseConnectionRevision
            }
          />

          <details
            open={baseProductRevision !== null}
            className="rounded-2xl border border-neutral-200 bg-white p-5"
          >
            <summary className="cursor-pointer text-sm font-semibold text-neutral-950">
              {baseProductRevision !== null
                ? "Your saved Product Draft"
                : "Add a Product (optional)"}
            </summary>
            <div className="mt-4">
              <ProductDraftForm
                initialSourceUrl={initialProductSourceUrl}
                initialTitle={initialProductTitle}
                baseProductRevision={baseProductRevision}
              />
            </div>
          </details>
        </>
      )}

      {recommendation !== "resource" ? optionalResource : null}

      {state.status === "error" &&
      state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
        >
          {state.message}
        </p>
      ) : null}

      <div className="space-y-3">
        <form action={formAction}>
          <input
            type="hidden"
            name="baseProgressRevision"
            value={baseProgressRevision}
          />

          <ContinueButton />
        </form>

        <form action={formAction}>
          <input
            type="hidden"
            name="baseProgressRevision"
            value={baseProgressRevision}
          />

          <SkipButton />
        </form>
      </div>

      <p className="text-xs leading-5 text-neutral-500">
        Continuing from this step does
        not publish your Identity or
        create public Spill content.
      </p>
    </div>
  );
}
