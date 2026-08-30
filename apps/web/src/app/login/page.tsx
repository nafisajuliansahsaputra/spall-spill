import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log In | Spall Spill",
};

export default async function LoginPage() {
  const supabase = await createClient();

  const {
    data: claimsData,
    error: claimsError,
  } = await supabase.auth.getClaims();

  const authUserId = claimsData?.claims?.sub;

  if (
    !claimsError &&
    typeof authUserId === "string" &&
    authUserId.length > 0
  ) {
    redirect("/auth/resolve");
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-5 py-10 text-neutral-950">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm font-semibold text-neutral-950"
          >
            Spall Spill
          </Link>
        </div>

        <section
          aria-labelledby="login-title"
          className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-7 space-y-2">
            <h1
              id="login-title"
              className="text-3xl font-semibold tracking-tight"
            >
              Welcome back
            </h1>

            <p className="text-sm leading-6 text-neutral-600">
              Log in to your existing Spall
              Spill owner account and continue
              from the correct workspace state.
            </p>
          </div>

          <LoginForm />

          <div className="mt-5 text-center">
            <Link
              href="/recovery"
              className="text-sm font-medium text-neutral-700 underline underline-offset-4"
            >
              Forgot your password?
            </Link>
          </div>

          <div className="mt-7 border-t border-neutral-200 pt-6">
            <p className="text-center text-sm text-neutral-600">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-semibold text-neutral-950 underline underline-offset-4"
              >
                Create account
              </Link>
            </p>
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-neutral-500">
          Login only confirms your identity.
          Your current account and onboarding
          state determine where you continue.
        </p>
      </div>
    </main>
  );
}