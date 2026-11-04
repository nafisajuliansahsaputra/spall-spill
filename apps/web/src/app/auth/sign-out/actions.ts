"use server";

import { redirect } from "next/navigation";
import { clearIntendedDestinationCookie } from "@/lib/auth/intended-destination-cookie";
import { createSessionExitContext } from "@/lib/supabase/server";

export type SignOutState = { status: "idle" | "error"; message: string | null };
export async function signOutAction(): Promise<SignOutState> {
  try {
    const { client, commitCookieChanges } = await createSessionExitContext();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return { status: "error", message: "We couldn't confirm Sign Out. Please try again." };
    commitCookieChanges();
    await clearIntendedDestinationCookie();
  } catch {
    return { status: "error", message: "We couldn't confirm Sign Out. Please try again." };
  }
  redirect("/login");
}
