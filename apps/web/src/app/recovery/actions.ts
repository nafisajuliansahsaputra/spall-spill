"use server";
import { redirect } from "next/navigation";
import { createRecoveryClient, recoveryEmailSchema, recoveryTokenSchema, recoveryPasswordSchema, requestRecovery, restoreRecovery } from "@/lib/auth/recovery";
import type { RecoveryState } from "./state";

export async function requestRecoveryAction(_state: RecoveryState, form: FormData): Promise<RecoveryState> {
  const email = recoveryEmailSchema.safeParse(form.get("email"));
  if (!email.success) return { status: "error", message: "Enter a valid email address." };
  try { await requestRecovery(createRecoveryClient(), email.data); } catch { /* same privacy-safe response */ }
  return { status: "requested", retryAt: Date.now() + 60000, message: "If recovery is available for this address, check your inbox for a reset link. Requests may be limited; wait a minute before trying again." };
}
export async function restoreRecoveryAction(_state: RecoveryState, form: FormData): Promise<RecoveryState> {
  const token = recoveryTokenSchema.safeParse(form.get("token_hash"));
  const password = recoveryPasswordSchema.safeParse(form.get("password"));
  if (!token.success) return { status: "error", message: "This recovery link isn’t valid. Request a new one below." };
  if (!password.success) return { status: "error", message: "Use a password with 8 to 1024 characters." };
  if (password.data !== form.get("confirmation")) return { status: "error", message: "Your passwords don’t match. Try again." };
  let restored = false;
  try { restored = await restoreRecovery(createRecoveryClient(), token.data, password.data); } catch { /* safe failure */ }
  if (!restored) return { status: "error", message: "We couldn’t restore access with this link. It may be expired or already used. Request a new one below." };
  redirect("/login?notice=password_reset");
}
