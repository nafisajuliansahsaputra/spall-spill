import { DocumentLink } from "@/components/document-link";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell, ArrowIcon } from "@/components/auth-shell";

import { createClient } from "@/lib/supabase/server";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create account",
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

  return <AuthShell title="Make a little space for you." description="Create your account. Your Identity comes next."
    footer={<p>Already part of it? <Link href="/login">Log in</Link></p>}>
    {confirmationFailed ? <p role="alert" className="auth-notice error">We couldn’t confirm that email link. It may be invalid or expired.</p> : null}
    <DocumentLink href="/auth/google" className="provider-button">Continue with Google <ArrowIcon /></DocumentLink>
    <div className="auth-divider"><span>or with email</span></div>
    <SignUpForm />
    <p className="auth-smallprint">Nothing goes public until you explicitly publish.</p>
  </AuthShell>;
}
