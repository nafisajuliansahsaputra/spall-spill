import "server-only";

import { z } from "zod";

import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  profileMediaSourceContentTypeSchema,
  type ProfileMediaSourceContentType,
} from "@/lib/profile-media/contracts";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const uuidSchema =
  z.string().uuid();

const onboardingStepSchema =
  z.enum([
    "claim_handle",
    "primary_use_case",
    "basic_identity",
    "starter_composition",
    "relevant_first_job",
    "preview_publish",
  ]);

const timestampSchema =
  z.string().refine(
    (value) =>
      !Number.isNaN(
        Date.parse(value),
      ),
    {
      message:
        "Expected a valid database timestamp.",
    },
  );

const byteSizeSchema =
  z.number().int().positive();

const dimensionSchema =
  z.number().int().positive();

const canonicalAssetShape = {
  asset_key: uuidSchema,
  object_key:
    z.string().min(1),
  stored_content_type:
    z.literal(
      PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
    ),
  byte_size: byteSizeSchema,
  width: dimensionSchema,
  height: dimensionSchema,
} as const;

const createUploadIntentResultSchema =
  z.discriminatedUnion(
    "status",
    [
      z.object({
        status:
          z.literal("success"),
        upload_intent_id:
          uuidSchema,
        staging_object_key:
          z.string().min(1),
        expected_content_type:
          profileMediaSourceContentTypeSchema,
        declared_byte_size:
          byteSizeSchema,
        expires_at:
          timestampSchema,
      }),

      z.object({
        status:
          z.literal(
            "owner_missing",
          ),
      }),

      z.object({
        status:
          z.literal(
            "owner_not_eligible",
          ),
      }),

      z.object({
        status:
          z.literal(
            "progress_missing",
          ),
      }),

      z.object({
        status:
          z.literal(
            "step_not_available",
          ),
        current_step:
          onboardingStepSchema,
      }),

      z.object({
        status:
          z.literal(
            "invalid_content_type",
          ),
      }),

      z.object({
        status:
          z.literal(
            "invalid_byte_size",
          ),
      }),
    ],
  );

const resolveUploadIntentResultSchema =
  z.discriminatedUnion(
    "status",
    [
      z.object({
        status:
          z.literal("success"),
        intent_status:
          z.literal("processing"),
        expected_content_type:
          profileMediaSourceContentTypeSchema,
        declared_byte_size:
          byteSizeSchema,
        staging_object_key:
          z.string().min(1),
        expires_at:
          timestampSchema,
      }),

      z.object({
        status:
          z.literal("processing"),
        expires_at:
          timestampSchema,
      }),

      z.object({
        status:
          z.literal("consumed"),
        ...canonicalAssetShape,
      }),

      z.object({
        status:
          z.literal(
            "owner_missing",
          ),
      }),

      z.object({
        status:
          z.literal(
            "owner_not_eligible",
          ),
      }),

      z.object({
        status:
          z.literal(
            "intent_missing",
          ),
      }),

      z.object({
        status:
          z.literal("expired"),
      }),

      z.object({
        status:
          z.literal("rejected"),
      }),

      z.object({
        status:
          z.literal(
            "asset_missing",
          ),
      }),
    ],
  );

const completeUploadResultSchema =
  z.discriminatedUnion(
    "status",
    [
      z.object({
        status:
          z.literal("success"),
        idempotent:
          z.boolean(),
        ...canonicalAssetShape,
      }),

      z.object({
        status:
          z.literal(
            "owner_missing",
          ),
      }),

      z.object({
        status:
          z.literal(
            "owner_not_eligible",
          ),
      }),

      z.object({
        status:
          z.literal(
            "intent_missing",
          ),
      }),

      z.object({
        status:
          z.literal("expired"),
      }),

      z.object({
        status:
          z.literal("rejected"),
      }),

      z.object({
        status:
          z.literal(
            "asset_missing",
          ),
      }),

      z.object({
        status:
          z.literal(
            "invalid_asset_metadata",
          ),
      }),

      z.object({
        status:
          z.literal(
            "asset_conflict",
          ),
      }),
    ],
  );

export type CreateProfileMediaUploadIntentResult =
  z.infer<
    typeof createUploadIntentResultSchema
  >;

export type ResolveProfileMediaUploadIntentResult =
  z.infer<
    typeof resolveUploadIntentResultSchema
  >;

export type CompleteProfileMediaUploadResult =
  z.infer<
    typeof completeUploadResultSchema
  >;

export type CompleteProfileMediaUploadInput =
  Readonly<{
    authUserId: string;
    uploadIntentId: string;
    assetKey: string;
    objectKey: string;
    byteSize: number;
    width: number;
    height: number;
  }>;

export class ProfileMediaDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name =
      "ProfileMediaDatabaseError";
  }
}

function parseDatabasePayload<T>(
  schema: z.ZodType<T>,
  value: unknown,
  operationName: string,
): T {
  const parsed =
    schema.safeParse(value);

  if (!parsed.success) {
    throw new ProfileMediaDatabaseError(
      `${operationName} returned an invalid database payload.`,
    );
  }

  return parsed.data;
}

async function callServiceRpc(
  functionName: string,
  args: Record<
    string,
    string | number | null
  >,
): Promise<unknown> {
  const supabase =
    createSupabaseServiceClient();

  const {
    data,
    error,
  } = await supabase
    .schema("api")
    .rpc(
      functionName,
      args,
    );

  if (error) {
    throw new ProfileMediaDatabaseError(
      `${functionName} request failed.`,
    );
  }

  return data;
}

export async function createProfileMediaUploadIntent(
  input: Readonly<{
    authUserId: string;
    expectedContentType:
      ProfileMediaSourceContentType;
    declaredByteSize: number;
  }>,
): Promise<CreateProfileMediaUploadIntentResult> {
  const data =
    await callServiceRpc(
      "create_profile_media_upload_intent_server",
      {
        input_auth_user_id:
          input.authUserId,
        input_expected_content_type:
          input.expectedContentType,
        input_declared_byte_size:
          input.declaredByteSize,
      },
    );

  return parseDatabasePayload(
    createUploadIntentResultSchema,
    data,
    "Profile Media upload-intent creation",
  );
}

export async function resolveProfileMediaUploadIntent(
  input: Readonly<{
    authUserId: string;
    uploadIntentId: string;
  }>,
): Promise<ResolveProfileMediaUploadIntentResult> {
  const data =
    await callServiceRpc(
      "resolve_profile_media_upload_intent_server",
      {
        input_auth_user_id:
          input.authUserId,
        input_upload_intent_id:
          input.uploadIntentId,
      },
    );

  return parseDatabasePayload(
    resolveUploadIntentResultSchema,
    data,
    "Profile Media upload-intent resolution",
  );
}

export async function completeProfileMediaUpload(
  input: CompleteProfileMediaUploadInput,
): Promise<CompleteProfileMediaUploadResult> {
  const data =
    await callServiceRpc(
      "complete_profile_media_upload_server",
      {
        input_auth_user_id:
          input.authUserId,
        input_upload_intent_id:
          input.uploadIntentId,
        input_asset_key:
          input.assetKey,
        input_object_key:
          input.objectKey,
        input_stored_content_type:
          PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
        input_byte_size:
          input.byteSize,
        input_width:
          input.width,
        input_height:
          input.height,
      },
    );

  return parseDatabasePayload(
    completeUploadResultSchema,
    data,
    "Profile Media completion",
  );
}