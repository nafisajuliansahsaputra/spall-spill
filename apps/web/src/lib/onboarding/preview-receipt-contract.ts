import { z } from "zod";

export const previewSnapshotHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const previewReceiptSchema = z.object({
  status: z.literal("success"), receipt_id: z.uuid(),
  snapshot_hash: previewSnapshotHashSchema, expires_at: z.iso.datetime({ offset: true }),
}).strict();
export type PreviewReceipt = z.infer<typeof previewReceiptSchema>;
export type PreviewConfirmationState = {
  status: "idle" | "error" | "confirmed";
  message: string | null;
  receipt: PreviewReceipt | null;
};
