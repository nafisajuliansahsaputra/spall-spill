import "server-only";

import {
  normalizeExternalDestination,
  type ExternalDestinationRiskSignal,
} from "@spall-spill/external-destination-policy";
import {
  z,
} from "zod";

import {
  createSupabaseServiceClient,
} from "@/lib/supabase/service";

const pendingResponseSchema =
  z
    .object({
      status:
        z.literal("success"),

      url_hash:
        z
          .string()
          .regex(
            /^[0-9a-f]{64}$/,
          ),

      safety_status:
        z.literal("pending"),

      requires_scan:
        z.boolean(),

      revision:
        z
          .number()
          .int()
          .positive(),
    })
    .strict();

export type ExternalDestinationPendingResult =
  Readonly<{
    normalizedUrl: string;
    hostname: string;
    riskSignals:
      readonly ExternalDestinationRiskSignal[];
    urlHash: string;
    requiresScan: boolean;
    revision: number;
  }>;

export class ExternalDestinationSafetyError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "ExternalDestinationSafetyError";
  }
}

export async function ensureExternalDestinationPending(
  rawUrl: string,
): Promise<ExternalDestinationPendingResult> {
  /*
   * Policy normalization is always performed before
   * privileged database authority is reached.
   */
  const normalized =
    normalizeExternalDestination(
      rawUrl,
    );

  const supabase =
    createSupabaseServiceClient();

  const {
    data,
    error,
  } =
    await supabase
      .schema("api")
      .rpc(
        "ensure_external_destination_pending_server",
        {
          input_normalized_url:
            normalized.normalizedUrl,

          input_risk_signals:
            [...normalized.riskSignals],
        },
      );

  if (error) {
    throw new ExternalDestinationSafetyError(
      "External destination safety registration failed.",
    );
  }

  const parsed =
    pendingResponseSchema.safeParse(
      data,
    );

  if (!parsed.success) {
    throw new ExternalDestinationSafetyError(
      "External destination safety registration returned an invalid response.",
    );
  }

  return {
    normalizedUrl:
      normalized.normalizedUrl,

    hostname:
      normalized.hostname,

    riskSignals:
      normalized.riskSignals,

    urlHash:
      parsed.data.url_hash,

    requiresScan:
      parsed.data.requires_scan,

    revision:
      parsed.data.revision,
  };
}