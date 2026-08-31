import { z } from "zod";

export const ONBOARDING_STEPS = [
  "claim_handle",
  "primary_use_case",
  "basic_identity",
  "starter_composition",
  "relevant_first_job",
  "preview_publish",
] as const;

export const PRIMARY_USE_CASES = [
  "creator",
  "affiliate",
  "business",
  "personal",
  "other",
] as const;

export const CANONICAL_HANDLE_PATTERN =
  /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;

export const onboardingStepSchema = z.enum(
  ONBOARDING_STEPS,
);

export const primaryUseCaseSchema = z.enum(
  PRIMARY_USE_CASES,
);

const canonicalHandleSchema = z
  .string()
  .min(
    3,
    "Use at least 3 characters.",
  )
  .max(
    30,
    "Use no more than 30 characters.",
  )
  .regex(
    CANONICAL_HANDLE_PATTERN,
    "Start and end with a letter or number. Use only letters, numbers, dots, underscores, or hyphens.",
  );

export const handleInputSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(canonicalHandleSchema);