"use server";

import { redirect } from "next/navigation";

import { loginCredentialsSchema } from "@/lib/auth/login-validation";
import { createClient } from "@/lib/supabase/server";
import { resolveCurrentOwnerDestination } from "@/lib/auth/resolved-destination";

import type { LoginActionState } from "./state";

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  const email =
    typeof rawEmail === "string" ? rawEmail : "";

  const password =
    typeof rawPassword === "string"
      ? rawPassword
      : "";

  const parsed = loginCredentialsSchema.safeParse({
    email,
    password,
  });

  if (!parsed.success) {
    const flattened =
      parsed.error.flatten().fieldErrors;

    const fieldErrors: LoginActionState["fieldErrors"] =
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

  const { error } =
    await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

  if (error) {
    return {
      status: "error",
      message:
        "We couldn't sign you in with those credentials. Check your details or recover access.",
      email: parsed.data.email,
      fieldErrors: {},
    };
  }

  const destination = await resolveCurrentOwnerDestination();
  if (destination === null) {
    return {
      status: "error", email: parsed.data.email, fieldErrors: {},
      message: "We couldn't safely resolve your account state. Please try again later.",
    };
  }
  redirect(destination);
}
