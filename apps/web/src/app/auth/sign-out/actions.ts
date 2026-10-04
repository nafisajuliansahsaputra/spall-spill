"use server";

import { redirect } from "next/navigation";
import { clearIntendedDestinationCookie } from "@/lib/auth/intended-destination-cookie";
import { createClient } from "@/lib/supabase/server";

export type SignOutState = { status: "idle" | "error"; message: string | null };
export async function signOutAction(): Promise<SignOutState> {
  try {
    const client = await createClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return { status: "error", message: "We couldn't confirm Sign Out. Please try again." };
    await clearIntendedDestinationCookie();
  } catch {
    return { status: "error", message: "We couldn't confirm Sign Out. Please try again." };
  }
  redirect("/login");
}
