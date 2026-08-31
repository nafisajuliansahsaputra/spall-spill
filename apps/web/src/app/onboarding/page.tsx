import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { resolveCurrentOnboardingState } from "@/lib/onboarding/state";
import { ONBOARDING_STEPS } from "@/lib/onboarding/validation";

import { HandleForm } from "./handle-form";
import { PrimaryUseCaseForm } from "./primary-use-case-form";

export const metadata: Metadata = {
  title: "Set Up Your Spall Spill",
};

const STEP_LABELS = {
  claim_handle: "Claim Handle",
  primary_use_case: "Primary Use Case",
  basic_identity: "Basic Identity",
  starter_composition:
    "Starter Composition",
  relevant_first_job:
    "Relevant First Job",
  preview_publish:
    "Preview & Publish",
} as const;

function DeferredStep({
  step,
}: {
  step:
    | "basic_identity"
    | "starter_composition"
    | "relevant_first_job"
    | "preview_publish";
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm leading-6 text-neutral-700">
      Your progress is safely saved.
      <strong className="ml-1 font-semibold text-neutral-950">
        {STEP_LABELS[step]}
      </strong>{" "}
      is the next implementation
      checkpoint and is not being
      simulated with temporary data.
    </div>
  );
}

export default async function OnboardingPage() {
  const ownerState =
    await resolveCurrentOwnerState();

  if (
    ownerState.status !==
    "onboarding_incomplete"
  ) {
    redirect("/auth/resolve");
  }

  const onboarding =
    await resolveCurrentOnboardingState();

  if (onboarding.status !== "success") {
    switch (onboarding.status) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");

      case "progress_missing":
        throw new Error(
          "Authoritative onboarding progress is missing.",
        );
    }
  }

  const stepNumber =
    ONBOARDING_STEPS.indexOf(
      onboarding.currentStep,
    ) + 1;

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-8 text-neutral-950 sm:py-10">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-tight">
            Spall Spill
          </span>

          <span className="text-xs font-medium text-neutral-500">
            Step {stepNumber} of{" "}
            {ONBOARDING_STEPS.length}
          </span>
        </header>

        <div
          aria-hidden="true"
          className="mb-8 h-1.5 overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className="h-full rounded-full bg-neutral-950 transition-[width]"
            style={{
              width: `${(stepNumber / ONBOARDING_STEPS.length) * 100}%`,
            }}
          />
        </div>

        <section
          aria-labelledby="onboarding-title"
          className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
        >
          {onboarding.currentStep ===
          "claim_handle" ? (
            <>
              <div className="mb-7 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Step 1
                </p>

                <h1
                  id="onboarding-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  Claim your Handle
                </h1>

                <p className="text-sm leading-6 text-neutral-600">
                  Your Handle becomes your
                  public Spall Spill
                  namespace. It is separate
                  from your Display Name and
                  does not become your
                  account identity.
                </p>
              </div>

              <HandleForm
                initialHandle={
                  onboarding.currentHandle
                }
                baseRevision={
                  onboarding.revision
                }
              />
            </>
          ) : null}

          {onboarding.currentStep ===
          "primary_use_case" ? (
            <>
              <div className="mb-7 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Step 2
                </p>

                <h1
                  id="onboarding-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  What are you starting
                  with?
                </h1>

                <p className="text-sm leading-6 text-neutral-600">
                  Pick the closest match.
                  Spall Spill uses this to
                  adapt guidance and starter
                  emphasis, not to create a
                  restricted account type.
                </p>

                {onboarding.currentHandle ? (
                  <p className="pt-1 text-sm text-neutral-500">
                    Handle:{" "}
                    <span className="font-medium text-neutral-800">
                      @
                      {
                        onboarding.currentHandle
                      }
                    </span>
                  </p>
                ) : null}
              </div>

              <PrimaryUseCaseForm
                initialPrimaryUseCase={
                  onboarding.primaryUseCase
                }
                baseRevision={
                  onboarding.revision
                }
              />
            </>
          ) : null}

          {onboarding.currentStep ===
            "basic_identity" ||
          onboarding.currentStep ===
            "starter_composition" ||
          onboarding.currentStep ===
            "relevant_first_job" ||
          onboarding.currentStep ===
            "preview_publish" ? (
            <>
              <div className="mb-7 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Step {stepNumber}
                </p>

                <h1
                  id="onboarding-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  {
                    STEP_LABELS[
                      onboarding.currentStep
                    ]
                  }
                </h1>
              </div>

              <DeferredStep
                step={
                  onboarding.currentStep
                }
              />
            </>
          ) : null}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-neutral-500">
          Saved onboarding progress is
          account-side and can be resumed
          after a normal interruption.
        </p>
      </div>
    </main>
  );
}