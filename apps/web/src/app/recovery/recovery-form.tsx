"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { requestRecoveryAction, restoreRecoveryAction } from "./actions";
import { initialRecoveryState } from "./state";

export function RecoveryForm({ token }: { token: string | null }) {
  const [state, action, pending] = useActionState(token ? restoreRecoveryAction : requestRecoveryAction, initialRecoveryState);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.status !== "requested") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state]);
  const cooldown = state.status === "requested"
    ? Math.max(0, Math.min(60, Math.ceil(((state.retryAt ?? 0) - now) / 1000))) : 0;
  return <form action={action} className="recovery-form" aria-busy={pending}>
    {token ? <>
      <input type="hidden" name="token_hash" value={token} />
      <label htmlFor="recovery-password">New password<input id="recovery-password" name="password" type="password" minLength={8} maxLength={1024} autoComplete="new-password" required /></label>
      <label htmlFor="recovery-confirmation">Confirm new password<input id="recovery-confirmation" name="confirmation" type="password" minLength={8} maxLength={1024} autoComplete="new-password" required /></label>
    </> : <label htmlFor="recovery-email">Email address<input id="recovery-email" name="email" type="email" maxLength={254} autoComplete="email" required /></label>}
    {state.message ? <p role={state.status === "error" ? "alert" : "status"} className={`auth-notice ${state.status === "error" ? "error" : "success"}`}>{state.message}</p> : null}
    <button type="submit" disabled={pending || cooldown > 0}>{pending ? "Please wait…" : cooldown > 0 ? `Try again in ${cooldown}s` : token ? "Update password" : "Send recovery email"}</button>
    {token ? <p className="auth-recovery"><Link href="/recovery">Request a new recovery link</Link></p> : null}
  </form>;
}
