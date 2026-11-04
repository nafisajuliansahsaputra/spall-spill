import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { AuthShell } from "@/components/auth-shell";
import { SignOutForm } from "@/app/auth/sign-out/sign-out-form";

export const metadata: Metadata = { title: "Account status", robots: { index: false, follow: false } };
export default async function AccountStatusPage() {
  const state = await resolveCurrentOwnerState();
  if (state.status === "unauthenticated") redirect("/login");
  if (state.status === "onboarding_incomplete") redirect("/onboarding");
  if (state.status === "active") redirect("/dashboard");
  if (state.status === "owner_missing") throw new Error("The current account status could not be verified.");
  return <AuthShell
    title={state.status === "suspended" ? "Your account is suspended" : "Your account access is restricted"}
    description="Publishing and normal workspace access are currently unavailable for this account. This restriction does not delete your saved work."
    footer={<p>Signing out does not remove the account restriction.</p>}
  >
    <section aria-label="Account status" className="space-y-5">
      <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm leading-6">Detailed enforcement information and review options are not available here yet.</p>
      <SignOutForm />
    </section>
  </AuthShell>;
}
