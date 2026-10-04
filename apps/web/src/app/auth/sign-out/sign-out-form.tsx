"use client";

import { useActionState } from "react";
import { signOutAction, type SignOutState } from "./actions";
const initial: SignOutState = { status: "idle", message: null };
export function SignOutForm() {
  const [state, action, pending] = useActionState(signOutAction, initial);
  return <form action={action} className="space-y-3">
    {state.message ? <p role="alert" className="text-sm leading-6">{state.message}</p> : null}
    <button type="submit" disabled={pending} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
      {pending ? "Signing out…" : "Sign Out"}
    </button>
  </form>;
}
