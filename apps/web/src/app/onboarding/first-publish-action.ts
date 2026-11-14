"use server";
import { createOnboardingPublishClient } from "@/lib/workspace/profile-editor-server";
import { firstIdentityPublishAvailable } from "@/lib/onboarding/first-publish-config";
import { createFirstIdentityPublisher, firstPublishIntentSchema, firstIdentityPublicationSchema } from "@/lib/onboarding/first-identity-publish";

export type FirstPublishState = { status: "idle" | "error" | "reload" | "published"; message: string | null; handle: string | null };
export async function firstIdentityPublishAction(_previous: FirstPublishState, form: FormData): Promise<FirstPublishState> {
  const fields = ["receiptId", "snapshotHash", "bundle", "confirmIdentityOnly"];
  const invalid: FirstPublishState = { status: "error", message: "Confirm Identity-only publication after reviewing your saved preview.", handle: null };
  if (!fields.every(key => form.getAll(key).length === 1 && typeof form.get(key) === "string")
    || !Array.from(form.keys()).every(key => key.startsWith("$ACTION_") || fields.includes(key))
    || form.get("bundle") !== "identity_only" || form.get("confirmIdentityOnly") !== "true") return invalid;
  const input = firstPublishIntentSchema.safeParse({ input_receipt_id: form.get("receiptId"), input_snapshot_hash: form.get("snapshotHash") });
  if (!input.success) return invalid;
  if (firstIdentityPublishAvailable()) {
    try {
      const client = await createOnboardingPublishClient();
      const result = await createFirstIdentityPublisher(client).publish(input.data);
      const ack = firstIdentityPublicationSchema.safeParse(result);
      if (ack.success) return { status: "published", message: "Your Identity is published. Product and Resource Drafts remain private.", handle: ack.data.current_handle };
    } catch { /* Explicit full GET reconciles even a lost committed acknowledgment. */ }
  }
  return { status: "reload", message: "We couldn’t confirm publication. Reload saved setup to check the current state before trying again.", handle: null };
}
