import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell, ArrowIcon } from "@/components/auth-shell";

import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log In | Spall Spill",
};

type LoginPageProps = {
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

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
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

  const oauthFailed =
    notice === "oauth_failed";

  return <AuthShell title="Good to have you back." description="Log in to pick up where you left off."
    footer={<p>New here? <Link href="/signup">Create an account</Link></p>}>
    {oauthFailed ? <p role="alert" className="auth-notice error">We couldn’t complete Google sign-in. Try again or use email and password.</p> : null}
    {notice === "password_reset" ? <p role="status" className="auth-notice success">Your password has been updated. Log in to continue.</p> : null}
    <a href="/auth/google" className="provider-button">Continue with Google <ArrowIcon /></a>
    <div className="auth-divider"><span>or with email</span></div>
    <LoginForm />
    <p className="auth-recovery"><Link href="/recovery">Can’t access your account?</Link></p>
  </AuthShell>;
}
