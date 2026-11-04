import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { recoveryTokenSchema } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";
import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = { title: "Recover access", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ token_hash?: string | string[] }> }) {
  const params = await searchParams;
  const token = recoveryTokenSchema.safeParse(params.token_hash);
  if (params.token_hash === undefined) {
    const client = await createClient(); const { data, error } = await client.auth.getClaims();
    if (!error && typeof data?.claims?.sub === "string" && data.claims.sub.length > 0) redirect("/auth/resolve");
  }
  const invalid = params.token_hash !== undefined && !token.success;
  return <AuthShell title={token.success ? "A fresh start." : "Let’s get you back in."}
    description={token.success ? "Choose a new password for your account." : "Enter your account email to request a password reset. Google accounts can also continue through Google login."}
    footer={<p>Remembered it? <Link href="/login">Back to login</Link></p>}>
    {invalid ? <p role="alert" className="auth-notice error">This recovery link isn’t valid. Request a new one.</p> : null}
    <RecoveryForm token={token.success ? token.data : null} />
    <p className="auth-smallprint">Recovery restores access. Your saved work and account restrictions stay in place.</p>
  </AuthShell>;
}
