"use server";

import { signUpCredentialsSchema } from "@/lib/auth/signup-validation";
import { createClient } from "@/lib/supabase/server";

import type { SignUpActionState } from "./state";

export async function signUpAction(
  _previousState: SignUpActionState,
  formData: FormData,
): Promise<SignUpActionState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  const email =
    typeof rawEmail === "string" ? rawEmail : "";

  const password =
    typeof rawPassword === "string"
      ? rawPassword
      : "";

  const parsed = signUpCredentialsSchema.safeParse({
    email,
    password,
  });

  if (!parsed.success) {
    const flattened =
      parsed.error.flatten().fieldErrors;

    const fieldErrors: SignUpActionState["fieldErrors"] =
      {};

    const emailError = flattened.email?.[0];
    const passwordError =
      flattened.password?.[0];

    if (emailError) {
      fieldErrors.email = emailError;
    }

    if (passwordError) {
      fieldErrors.password =
        passwordError;
    }

    return {
      status: "error",
      message:
        "Check the highlighted fields and try again.",
      email,
      fieldErrors,
    };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      status: "error",
      message:
        "We couldn't complete that request right now. Try again.",
      email: parsed.data.email,
      fieldErrors: {},
    };
  }

  return {
    status: "success",
    message:
      "Check your email to continue. If this address can be registered, we've sent a confirmation link.",
    email: parsed.data.email,
    fieldErrors: {},
  };
}