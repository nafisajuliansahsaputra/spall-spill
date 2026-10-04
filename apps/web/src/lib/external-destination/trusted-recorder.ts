import "server-only";

import {
  z,
} from "zod";

import {
  createSupabaseServiceClient,
} from "@/lib/supabase/service";

import {
  scanExternalDestination,
  type ExternalDestinationScannerVerdict,
} from "./scanner-client";

import type {
  ExternalDestinationPendingResult,
} from "./safety";

const SCANNER_VERSION =
  "spall-url-safety-v1";

const SAFE_TTL_SECONDS =
  3600;

const REVIEW_TTL_SECONDS =
  3600;

const BLOCKED_TTL_SECONDS =
  86400;

const reasonCodeSchema =
  z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_:-]{0,63}$/,
    );

const recordResponseSchema =
  z
    .object({
      status:
        z.literal(
          "success",
        ),

      url_hash:
        z
          .string()
          .regex(
            /^[0-9a-f]{64}$/,
          ),

      safety_status:
        z.enum([
          "safe",
          "review",
          "blocked",
        ]),

      reason_codes:
        z
          .array(
            reasonCodeSchema,
          )
          .max(64),

      checked_at:
        z
          .string()
          .min(1)
          .max(128),

      expires_at:
        z
          .string()
          .min(1)
          .max(128),

      revision:
        z
          .number()
          .int()
          .positive(),
    })
    .strict();

export type RecordedExternalDestinationSafety =
  Readonly<{
    normalizedUrl: string;
    urlHash: string;

    safetyStatus:
      | "safe"
      | "review"
      | "blocked";

    reasonCodes:
      readonly string[];

    scannerVersion: string;

    checkedAt: string;
    expiresAt: string;
    revision: number;
  }>;

export class ExternalDestinationRecorderError
  extends Error {
  constructor(
    message: string,
  ) {
    super(message);

    this.name =
      "ExternalDestinationRecorderError";
  }
}

function mapVerdictForRecording(
  verdict:
    ExternalDestinationScannerVerdict,
): Readonly<{
  safetyStatus:
    | "safe"
    | "review"
    | "blocked";

  ttlSeconds: number;
}> {
  if (
    verdict.status ===
    "clear"
  ) {
    /*
     * The database status "safe" has stronger
     * meaning than merely receiving a syntactically
     * valid scanner response.
     *
     * Re-check the security-critical invariant at
     * this trusted persistence boundary.
     */
    if (
      verdict.hops.length ===
        0 ||
      verdict.finalStatusCode ===
        null ||
      verdict.finalStatusCode <
        200 ||
      verdict.finalStatusCode >
        299 ||
      verdict.reasonCodes.length >
        0 ||
      verdict.riskSignals.length >
        0
    ) {
      throw new ExternalDestinationRecorderError(
        "Scanner clear verdict does not satisfy the safe persistence invariant.",
      );
    }

    return {
      safetyStatus:
        "safe",

      ttlSeconds:
        SAFE_TTL_SECONDS,
    };
  }

  /*
   * A completed non-safe verdict without any
   * explanation is treated as malformed and
   * remains pending rather than becoming trusted.
   */
  if (
    verdict.reasonCodes.length ===
    0
  ) {
    throw new ExternalDestinationRecorderError(
      "Scanner non-safe verdict did not provide a reason.",
    );
  }

  if (
    verdict.status ===
    "blocked"
  ) {
    return {
      safetyStatus:
        "blocked",

      ttlSeconds:
        BLOCKED_TTL_SECONDS,
    };
  }

  return {
    safetyStatus:
      "review",

    ttlSeconds:
      REVIEW_TTL_SECONDS,
  };
}

export async function scanAndRecordPendingExternalDestination(
  pending:
    ExternalDestinationPendingResult,
): Promise<RecordedExternalDestinationSafety> {
  if (
    !pending.requiresScan
  ) {
    throw new ExternalDestinationRecorderError(
      "External destination does not require a scanner verdict.",
    );
  }

  /*
   * No database mutation occurs if the scanner
   * fails, times out, returns malformed data, or
   * fails binding validation. The row therefore
   * remains fail-closed as pending.
   */
  const verdict =
    await scanExternalDestination(
      pending.normalizedUrl,
    );

  const mapped =
    mapVerdictForRecording(
      verdict,
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
        "record_external_destination_safety_bound_server",
        {
          input_normalized_url:
            pending.normalizedUrl,

          input_expected_url_hash:
            pending.urlHash,

          input_expected_revision:
            pending.revision,

          input_safety_status:
            mapped.safetyStatus,

          input_reason_codes:
            [
              ...verdict.reasonCodes,
            ],

          input_scanner_version:
            SCANNER_VERSION,

          input_ttl_seconds:
            mapped.ttlSeconds,
        },
      );

  if (error) {
    throw new ExternalDestinationRecorderError(
      "External destination safety verdict recording failed.",
    );
  }

  const parsed =
    recordResponseSchema
      .safeParse(
        data,
      );

  if (!parsed.success) {
    throw new ExternalDestinationRecorderError(
      "External destination safety writer returned an invalid response.",
    );
  }

  if (
    parsed.data.url_hash !==
      pending.urlHash
  ) {
    throw new ExternalDestinationRecorderError(
      "External destination safety writer returned a mismatched URL identity.",
    );
  }

  if (
    parsed.data.safety_status !==
      mapped.safetyStatus
  ) {
    throw new ExternalDestinationRecorderError(
      "External destination safety writer returned a mismatched verdict.",
    );
  }

  /*
   * The bound writer performs exactly one
   * authoritative transition from the expected
   * pending revision.
   */
  if (
    parsed.data.revision !==
      pending.revision + 1
  ) {
    throw new ExternalDestinationRecorderError(
      "External destination safety writer returned an unexpected revision.",
    );
  }

  const checkedAt =
    Date.parse(
      parsed.data.checked_at,
    );

  const expiresAt =
    Date.parse(
      parsed.data.expires_at,
    );

  if (
    !Number.isFinite(
      checkedAt,
    ) ||
    !Number.isFinite(
      expiresAt,
    ) ||
    expiresAt <= checkedAt
  ) {
    throw new ExternalDestinationRecorderError(
      "External destination safety writer returned invalid verdict timestamps.",
    );
  }

  return {
    normalizedUrl:
      pending.normalizedUrl,

    urlHash:
      parsed.data.url_hash,

    safetyStatus:
      parsed.data.safety_status,

    reasonCodes:
      parsed.data.reason_codes,

    scannerVersion:
      SCANNER_VERSION,

    checkedAt:
      parsed.data.checked_at,

    expiresAt:
      parsed.data.expires_at,

    revision:
      parsed.data.revision,
  };
}