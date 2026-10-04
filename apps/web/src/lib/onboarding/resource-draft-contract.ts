import { z } from "zod";
import { onboardingStepSchema } from "./validation";

export const RESOURCE_TYPES = [
  ["menu", "Menu"], ["price_list", "Price list"], ["catalog", "Catalog"],
  ["portfolio", "Portfolio"], ["media_kit", "Media kit / Rate card"],
  ["document", "Document / PDF"], ["website", "Website / External resource"], ["other", "Other"],
] as const;
export const resourceTypeSchema = z.enum([
  "menu", "price_list", "catalog", "portfolio", "media_kit", "document", "website", "other",
]);
export const resourceTitleSchema = z.string().max(160).refine(
  (title) => !/[\u0000-\u001f\u007f]/.test(title), "Remove control characters from the title.",
);
export const resourceDraftSchema = z.object({
  resource_type: resourceTypeSchema,
  source_url: z.string().url().max(2048).regex(/^https?:\/\//i).nullable(),
  title: resourceTitleSchema.min(1).nullable(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict().refine((draft) => draft.source_url !== null || draft.title !== null);
export const resourceDraftSuccessSchema = z.object({
  status: z.literal("success"),
  current_step: z.enum(["relevant_first_job", "preview_publish"]),
  resource_draft: resourceDraftSchema.nullable(),
}).strict();
export const resourceDraftPayloadSchema = z.union([
  resourceDraftSuccessSchema,
  z.object({ status: z.enum([
    "unauthenticated", "owner_missing", "owner_unavailable", "onboarding_complete", "progress_missing",
  ]) }).strict(),
  z.object({ status: z.literal("step_not_available"), current_step: onboardingStepSchema }).strict(),
  z.object({ status: z.literal("prerequisite_missing"), prerequisite: z.enum([
    "primary_use_case", "current_handle", "identity_working", "identity_layout_working",
  ]) }).strict(),
]);
export type ResourceDraft = z.infer<typeof resourceDraftSchema>;
export type ResourceDraftActionState = {
  status: "idle" | "error";
  message: string | null;
  resourceType: string;
  sourceUrl: string;
  title: string;
  fieldErrors: Partial<Record<"resourceType" | "sourceUrl" | "title", string>>;
};
