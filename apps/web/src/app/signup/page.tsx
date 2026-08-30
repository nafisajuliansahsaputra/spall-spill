import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create Account | Spall Spill",
};

type SignUpPageProps = {
  searchParams: Promise<{
    notice?: string | string[];
  }>;
};

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

export default async function SignUpPage({
  searchParams,
}: SignUpPageProps) {
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

  const params = await searchParams;

  const notice = getSingleValue(
    params.notice,
  );

  const confirmationFailed =
    notice === "confirmation_failed";

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
          aria-labelledby="signup-title"
          className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-7 space-y-2">
            <h1
              id="signup-title"
              className="text-3xl font-semibold tracking-tight"
            >
              Create your account
            </h1>

            <p className="text-sm leading-6 text-neutral-600">
              Create one Spall Spill owner
              account. Your public identity and
              Spill setup come after email
              confirmation.
            </p>
          </div>

          {confirmationFailed ? (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              We couldn&apos;t confirm that
              email link. It may be invalid or
              expired.
            </div>
          ) : null}

          <SignUpForm />

          <div className="mt-7 border-t border-neutral-200 pt-6">
            <p className="text-center text-sm text-neutral-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-neutral-950 underline underline-offset-4"
              >
                Log in
              </Link>
            </p>
          </div>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-neutral-500">
          Use an email address you can access.
          You&apos;ll need to confirm it before
          continuing setup.
        </p>
      </div>
    </main>
  );
}