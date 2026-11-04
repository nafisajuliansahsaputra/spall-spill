import { SignOutForm } from "@/app/auth/sign-out/sign-out-form";

/** Native disclosure remains keyboard-operable before client hydration. */
export function PrivateSessionMenu() {
  return <details className="private-session-menu">
    <summary>Account</summary>
    <div className="private-session-panel">
      <p className="text-sm leading-6">Your saved setup stays private when you sign out. Save any changes before leaving.</p>
      <SignOutForm />
    </div>
  </details>;
}
