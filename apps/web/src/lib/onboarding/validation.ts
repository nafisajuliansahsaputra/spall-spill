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

export const STARTER_KEYS = [
  "clean",
  "social_focus",
  "featured",
  "business",
] as const;

export const CANONICAL_HANDLE_PATTERN =
  /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;

const DISPLAY_NAME_CONTROL_PATTERN =
  /[\u0000-\u001f\u007f-\u009f]/u;

const BIO_CONTROL_PATTERN =
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/u;

function countUnicodeCodePoints(
  value: string,
): number {
  return [...value].length;
}

export const onboardingStepSchema = z.enum(
  ONBOARDING_STEPS,
);

export const primaryUseCaseSchema = z.enum(
  PRIMARY_USE_CASES,
);

export const starterKeySchema = z.enum(
  STARTER_KEYS,
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

export const displayNameInputSchema = z
  .string()
  .transform((value) => value.trim())
  .superRefine((value, context) => {
    const length =
      countUnicodeCodePoints(value);

    if (length < 1) {
      context.addIssue({
        code: "custom",
        message:
          "Enter a Display Name.",
      });

      return;
    }

    if (length > 80) {
      context.addIssue({
        code: "custom",
        message:
          "Use no more than 80 characters.",
      });
    }

    if (
      DISPLAY_NAME_CONTROL_PATTERN.test(
        value,
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Display Name must stay on one line and cannot contain control characters.",
      });
    }
  });

export const bioInputSchema = z
  .string()
  .transform((value) =>
    value
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .trim(),
  )
  .superRefine((value, context) => {
    if (
      countUnicodeCodePoints(value) > 300
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Use no more than 300 characters.",
      });
    }

    if (
      BIO_CONTROL_PATTERN.test(value)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Bio contains an unsupported control character.",
      });
    }
  })
  .transform((value) =>
    value.length === 0 ? null : value,
  );