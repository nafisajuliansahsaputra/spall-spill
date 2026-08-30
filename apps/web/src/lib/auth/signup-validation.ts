import { z } from "zod";

export const SIGN_UP_PASSWORD_MIN_LENGTH = 8;

export const signUpCredentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Enter your email address.")
    .email("Enter a valid email address."),
  password: z
    .string()
    .min(
      SIGN_UP_PASSWORD_MIN_LENGTH,
      `Use at least ${SIGN_UP_PASSWORD_MIN_LENGTH} characters.`,
    ),
});