"use client";
import { useCallback, useState } from "react";
import { SignOutForm } from "@/app/auth/sign-out/sign-out-form";

/** Preserve a native pre-hydration interaction across subsequent RSC updates. */
export function PrivateSessionMenu() {
  const [open, setOpen] = useState(false);
  const captureOpenState = useCallback((node: HTMLDetailsElement | null) => {
    if (node) setOpen(node.open);
  }, []);
  return <details className="private-session-menu" ref={captureOpenState} open={open}
    onToggle={event => setOpen(event.currentTarget.open)} suppressHydrationWarning>
    <summary>Account</summary>
    <div className="private-session-panel">
      <p className="text-sm leading-6">Signing out keeps your saved work. Save changes before leaving.</p>
      <SignOutForm />
    </div>
  </details>;
}
