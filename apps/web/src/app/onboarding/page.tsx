import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  resolveCurrentOwnerState,
} from "@/lib/auth/owner-state";
import { resolveCurrentResourceDraftState } from "@/lib/onboarding/resource-draft";
import { resolveCurrentOnboardingPreview } from "@/lib/onboarding/preview";
import { PrivateOnboardingPreview } from "./private-preview";
import { PreviewConfirmationForm } from "./preview-confirmation-form";
import {
  resolveCurrentBasicIdentityState,
  resolveCurrentIdentityConnectionState,
  resolveCurrentOnboardingState,
  resolveCurrentProductDraftState,
  resolveCurrentRelevantFirstJobState,
  resolveCurrentStarterCompositionState,
} from "@/lib/onboarding/state";
import {
  ONBOARDING_STEPS,
  onboardingStepSchema,
} from "@/lib/onboarding/validation";
import {
  createTrustedProfileMediaPreviewUrl,
} from "@/lib/profile-media/preview";

import {
  BasicIdentityForm,
} from "./basic-identity-form";
import { HandleForm } from "./handle-form";
import {
  PrimaryUseCaseForm,
} from "./primary-use-case-form";
import {
  RelevantFirstJobForm,
} from "./relevant-first-job-form";
import {
  StarterCompositionForm,
} from "./starter-composition-form";

export const metadata: Metadata = {
  title: "Set Up Your Spall Spill",
};

type OnboardingPageProps = {
  searchParams: Promise<{
    step?: string | string[];
  }>;
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

type OnboardingStep =
  (typeof ONBOARDING_STEPS)[number];

function getSingleValue(
  value: string | string[] | undefined,
): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (
    Array.isArray(value) &&
    typeof value[0] === "string"
  ) {
    return value[0];
  }

  return null;
}

function resolveDisplayedStep(
  requestedStep: string | null,
  frontierStep: OnboardingStep,
): OnboardingStep {
  const parsed =
    onboardingStepSchema.safeParse(
      requestedStep,
    );

  if (!parsed.success) {
    return frontierStep;
  }

  const requestedIndex =
    ONBOARDING_STEPS.indexOf(
      parsed.data,
    );

  const frontierIndex =
    ONBOARDING_STEPS.indexOf(
      frontierStep,
    );

  if (requestedIndex > frontierIndex) {
    return frontierStep;
  }

  return parsed.data;
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
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

  const params = await searchParams;

  const displayedStep =
    resolveDisplayedStep(
      getSingleValue(params.step),
      onboarding.currentStep,
    );

  const frontierIndex =
    ONBOARDING_STEPS.indexOf(
      onboarding.currentStep,
    );

  const displayedIndex =
    ONBOARDING_STEPS.indexOf(
      displayedStep,
    );

  const stepNumber =
    displayedIndex + 1;

  const frontierStepNumber =
    frontierIndex + 1;

  const reviewingEarlierStep =
    displayedIndex < frontierIndex;

  const previousStep =
    displayedIndex > 0
      ? ONBOARDING_STEPS[
          displayedIndex - 1
        ]
      : null;

  const basicIdentity =
    displayedStep === "basic_identity"
      ? await resolveCurrentBasicIdentityState()
      : null;

  if (
    basicIdentity &&
    basicIdentity.status !== "success"
  ) {
    switch (basicIdentity.status) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");

      case "progress_missing":
        throw new Error(
          "Authoritative onboarding progress is missing while resolving Basic Identity.",
        );
    }
  }

  const starterComposition =
    displayedStep ===
    "starter_composition"
      ? await resolveCurrentStarterCompositionState()
      : null;

  if (
    starterComposition &&
    starterComposition.status !==
      "success"
  ) {
    switch (
      starterComposition.status
    ) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");

      case "progress_missing":
        throw new Error(
          "Authoritative onboarding progress is missing while resolving Starter Composition.",
        );
    }
  }

  const relevantFirstJob =
    displayedStep ===
    "relevant_first_job"
      ? await resolveCurrentRelevantFirstJobState()
      : null;

  if (
    relevantFirstJob &&
    relevantFirstJob.status !== "success"
  ) {
    switch (relevantFirstJob.status) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");

      case "step_not_available":
        redirect("/onboarding");

      case "progress_missing":
        throw new Error(
          "Authoritative onboarding progress is missing while resolving Relevant First Job.",
        );

      case "prerequisite_missing":
        throw new Error(
          `Required onboarding prerequisite is missing before Relevant First Job: ${relevantFirstJob.prerequisite}.`,
        );
    }
  }

  const identityConnection =
    displayedStep ===
    "relevant_first_job"
      ? await resolveCurrentIdentityConnectionState()
      : null;

  if (
    identityConnection &&
    identityConnection.status !==
      "success"
  ) {
    switch (
      identityConnection.status
    ) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");

      case "step_not_available":
        redirect("/onboarding");

      case "progress_missing":
        throw new Error(
          "Authoritative onboarding progress is missing while resolving Identity Connection.",
        );

      case "prerequisite_missing":
        throw new Error(
          `Required onboarding prerequisite is missing before Identity Connection: ${identityConnection.prerequisite}.`,
        );
    }
  }
  const productDraft =
    displayedStep ===
    "relevant_first_job"
      ? await resolveCurrentProductDraftState()
      : null;

  if (
    productDraft &&
    productDraft.status !== "success"
  ) {
    switch (productDraft.status) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");

      case "step_not_available":
        redirect("/onboarding");

      case "progress_missing":
        throw new Error(
          "Authoritative onboarding progress is missing while resolving Product Draft.",
        );

      case "prerequisite_missing":
        throw new Error(
          `Required onboarding prerequisite is missing before Product Draft: ${productDraft.prerequisite}.`,
        );
    }
  }

  const resourceDraft = displayedStep === "relevant_first_job"
    ? await resolveCurrentResourceDraftState() : null;
  if (resourceDraft && resourceDraft.status !== "success") {
    switch (resourceDraft.status) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");
      case "step_not_available":
        redirect("/onboarding");
      case "progress_missing":
        throw new Error("Authoritative onboarding progress is missing while resolving Resource Draft.");
      case "prerequisite_missing":
        throw new Error(`Required onboarding prerequisite is missing before Resource Draft: ${resourceDraft.prerequisite}.`);
    }
  }

  const preview = displayedStep === "preview_publish" ? await resolveCurrentOnboardingPreview() : null;
  if (preview && preview.status !== "success") {
    switch (preview.status) {
      case "unauthenticated":
      case "owner_missing":
      case "owner_unavailable":
      case "onboarding_complete":
        redirect("/auth/resolve");
      case "step_not_available": redirect("/onboarding");
      case "progress_missing": throw new Error("Authoritative onboarding progress is missing during preview.");
      case "prerequisite_missing": throw new Error(`Required onboarding preview prerequisite is missing: ${preview.prerequisite}.`);
    }
  }

  const savedProfileAssetKey = preview?.status === "success" ? preview.identity_working.profile_asset_key :
    basicIdentity?.status ===
      "success"
      ? basicIdentity
          .identityWorking
          ?.profileAssetKey ??
        null
      : null;

  /*
   * Only sign a preview for an asset key that came
   * from the authenticated current-Owner resolver.
   * There is deliberately no generic browser-supplied
   * asset-key preview endpoint here.
   */
  const savedProfilePreviewUrl =
    savedProfileAssetKey
      ? await createTrustedProfileMediaPreviewUrl(
          savedProfileAssetKey,
        )
      : null;

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
          className="mb-5 h-1.5 overflow-hidden rounded-full bg-neutral-200"
        >
          <div
            className="h-full rounded-full bg-neutral-950 transition-[width]"
            style={{
              width: `${(stepNumber / ONBOARDING_STEPS.length) * 100}%`,
            }}
          />
        </div>

        {reviewingEarlierStep ? (
          <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm">
            <p className="leading-5 text-neutral-600">
              Reviewing Step{" "}
              {stepNumber}. Your saved
              progress remains at Step{" "}
              {frontierStepNumber}.
            </p>

            <Link
              href="/onboarding"
              className="shrink-0 font-semibold text-neutral-950 underline underline-offset-4"
            >
              Return
            </Link>
          </div>
        ) : null}

        <section
          aria-labelledby="onboarding-title"
          className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
        >
          {displayedStep ===
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

          {displayedStep ===
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

          {displayedStep ===
            "basic_identity" &&
          basicIdentity?.status ===
            "success" ? (
            <>
              <div className="mb-7 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Step 3
                </p>

                <h1
                  id="onboarding-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  Build your Basic Identity
                </h1>

                <p className="text-sm leading-6 text-neutral-600">
                  Add the minimum identity
                  people should recognize.
                  Display Name is required;
                  Bio and profile media are
                  optional.
                </p>

                {onboarding.currentHandle ? (
                  <p className="pt-1 text-sm text-neutral-500">
                    Public Handle:{" "}
                    <span className="font-medium text-neutral-800">
                      @
                      {
                        onboarding.currentHandle
                      }
                    </span>
                  </p>
                ) : null}
              </div>

              <BasicIdentityForm
                initialDisplayName={
                  basicIdentity
                    .identityWorking
                    ?.displayName ?? ""
                }
                initialBio={
                  basicIdentity
                    .identityWorking
                    ?.bio ?? null
                }
                initialProfileAssetKey={
                  savedProfileAssetKey
                }
                initialProfilePreviewUrl={
                  savedProfilePreviewUrl
                }
                baseIdentityRevision={
                  basicIdentity
                    .identityWorking
                    ?.revision ?? null
                }
                baseProgressRevision={
                  onboarding.revision
                }
                isFrontier={
                  onboarding.currentStep ===
                  "basic_identity"
                }
              />
            </>
          ) : null}

          {displayedStep ===
            "starter_composition" &&
          starterComposition?.status ===
            "success" ? (
            <>
              <div className="mb-7 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Step 4
                </p>

                <h1
                  id="onboarding-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  Choose your starting
                  composition
                </h1>

                <p className="text-sm leading-6 text-neutral-600">
                  Pick the layout emphasis
                  you want to begin with.
                  Every option keeps the same
                  product capabilities and
                  can be changed later.
                </p>

                <p className="pt-1 text-xs leading-5 text-neutral-500">
                  A recommendation may be
                  highlighted from your
                  Primary Use Case, but it
                  never removes the other
                  choices.
                </p>
              </div>

              <StarterCompositionForm
                initialStarterKey={
                  starterComposition
                    .layoutWorking
                    ?.starterKey ?? null
                }
                baseLayoutRevision={
                  starterComposition
                    .layoutWorking
                    ?.revision ?? null
                }
                baseProgressRevision={
                  onboarding.revision
                }
                primaryUseCase={
                  onboarding.primaryUseCase
                }
                isFrontier={
                  onboarding.currentStep ===
                  "starter_composition"
                }
              />
            </>
          ) : null}

          {displayedStep ===
            "relevant_first_job" &&
          relevantFirstJob?.status ===
            "success" ? (
            <>
              <div className="mb-7 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Step 5
                </p>

                <h1
                  id="onboarding-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  Add something useful
                </h1>

                <p className="text-sm leading-6 text-neutral-600">
                  Spall Spill recommends a
                  first job from your Primary
                  Use Case, but the
                  recommendation does not
                  restrict what your account
                  can do.
                </p>
              </div>

              <RelevantFirstJobForm
                recommendation={
                  relevantFirstJob
                    .recommendedFirstJob
                }
                baseProgressRevision={
                  relevantFirstJob
                    .progressRevision
                }
                initialConnectionKind={
                  identityConnection
                    ?.status ===
                  "success"
                    ? identityConnection
                        .connectionWorking
                        ?.connectionKind ??
                      null
                    : null
                }
                initialSocialPlatform={
                  identityConnection
                    ?.status ===
                  "success"
                    ? identityConnection
                        .connectionWorking
                        ?.socialPlatform ??
                      null
                    : null
                }
                initialDestinationUrl={
                  identityConnection
                    ?.status ===
                  "success"
                    ? identityConnection
                        .connectionWorking
                        ?.destinationUrl ??
                      ""
                    : ""
                }
                baseConnectionRevision={
                  identityConnection
                    ?.status ===
                  "success"
                    ? identityConnection
                        .connectionWorking
                        ?.revision ??
                      null
                    : null
                }
                initialResourceDraft={resourceDraft?.status === "success" ? resourceDraft.resource_draft : null}
                initialProductSourceUrl={
                  productDraft?.status ===
                  "success"
                    ? productDraft
                        .productDraft
                        ?.sourceUrl ??
                      ""
                    : ""
                }
                initialProductTitle={
                  productDraft?.status ===
                  "success"
                    ? productDraft
                        .productDraft
                        ?.title ??
                      null
                    : null
                }
                baseProductRevision={
                  productDraft?.status ===
                  "success"
                    ? productDraft
                        .productDraft
                        ?.revision ??
                      null
                    : null
                }
              />
            </>
          ) : null}

          {displayedStep ===
          "preview_publish" ? (
            <>
              <div className="mb-7 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500">
                  Step 6
                </p>

                <h1
                  id="onboarding-title"
                  className="text-3xl font-semibold tracking-tight"
                >
                  Preview & Publish
                </h1>
              </div>

              {preview?.status === "success" ? <PrivateOnboardingPreview preview={preview} profileUrl={savedProfilePreviewUrl} /> : null}
              {preview?.status === "success" ? <div className="mt-5"><PreviewConfirmationForm key={preview.snapshot_hash} snapshotHash={preview.snapshot_hash} /></div> : null}
            </>
          ) : null}

          {previousStep ? (
            <div className="mt-6 border-t border-neutral-200 pt-5">
              <Link
                href={`/onboarding?step=${previousStep}`}
                className="text-sm font-medium text-neutral-700 underline underline-offset-4"
              >
                Back to{" "}
                {STEP_LABELS[previousStep]}
              </Link>
            </div>
          ) : null}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-neutral-500">
          Saved means acknowledged Working
          state on the backend. It does not
          mean Published.
        </p>
      </div>
    </main>
  );
}
