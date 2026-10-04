import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveCurrentOwnerState } from "@/lib/auth/owner-state";
import { SignOutForm } from "@/app/auth/sign-out/sign-out-form";

export const metadata: Metadata = { title: "Account Status | Spall Spill", robots: { index: false, follow: false } };
export default async function AccountStatusPage() {
  const state = await resolveCurrentOwnerState();
  if (state.status === "unauthenticated") redirect("/login");
  if (state.status === "onboarding_incomplete") redirect("/onboarding");
  if (state.status === "active") redirect("/dashboard");
  if (state.status === "owner_missing") throw new Error("The current account status could not be verified.");
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-6 py-12">
    <p className="text-sm font-medium text-neutral-500">Spall Spill · Account Status</p>
    <h1 className="text-3xl font-semibold tracking-tight">{state.status === "suspended" ? "Your account is suspended" : "Your account access is restricted"}</h1>
    <p className="text-sm leading-6 text-neutral-700">Publishing and normal workspace access are currently unavailable for this account. This restriction does not delete your saved work.</p>
    <p className="text-sm leading-6 text-neutral-700">Detailed enforcement information and review options are not available here yet. Signing out does not remove the account restriction.</p>
    <SignOutForm />
  </main>;
}
