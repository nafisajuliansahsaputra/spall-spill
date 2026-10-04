import "server-only";

import {
  createHmac,
} from "node:crypto";

import {
  z,
} from "zod";

const SCANNER_TIMEOUT_MS =
  14_000;

const MAX_RESPONSE_BYTES =
  32 * 1024;

const MAX_HOPS =
  6;

const reasonCodeSchema =
  z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9_:-]{0,63}$/,
    );

const riskSignalSchema =
  z.enum([
    "http_transport",
    "punycode_hostname",
  ]);

const hopSchema =
  z
    .object({
      url:
        z
          .string()
          .min(8)
          .max(2048),

      statusCode:
        z
          .number()
          .int()
          .min(100)
          .max(599),
    })
    .strict();

const scannerResponseSchema =
  z
    .object({
      layer:
        z.literal(
          "destination_network",
        ),

      status:
        z.enum([
          "clear",
          "review",
          "blocked",
        ]),

      checkedUrl:
        z
          .string()
          .min(8)
          .max(2048),

      finalStatusCode:
        z
          .number()
          .int()
          .min(100)
          .max(599)
          .nullable(),

      hops:
        z
          .array(
            hopSchema,
          )
          .max(
            MAX_HOPS,
          ),

      reasonCodes:
        z
          .array(
            reasonCodeSchema,
          )
          .max(64),

      riskSignals:
        z
          .array(
            riskSignalSchema,
          )
          .max(2),
    })
    .strict();

export type ExternalDestinationScannerVerdict =
  Readonly<{
    status:
      | "clear"
      | "review"
      | "blocked";

    checkedUrl: string;

    finalStatusCode:
      number | null;

    hops:
      readonly Readonly<{
        url: string;
        statusCode: number;
      }>[];

    reasonCodes:
      readonly string[];

    riskSignals:
      readonly (
        | "http_transport"
        | "punycode_hostname"
      )[];
  }>;

export class ExternalDestinationScannerError
  extends Error {
  constructor(
    message: string,
  ) {
    super(message);

    this.name =
      "ExternalDestinationScannerError";
  }
}

function requireScannerOrigin(): URL {
  const raw =
    process.env
      .URL_SAFETY_SCANNER_ORIGIN
      ?.trim();

  if (!raw) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner origin is not configured.",
    );
  }

  let origin: URL;

  try {
    origin =
      new URL(
        raw,
      );
  } catch {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner origin is invalid.",
    );
  }

  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (
      origin.pathname !== "/" &&
      origin.pathname !== ""
    )
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner origin must be a bare origin.",
    );
  }

  const loopback =
    origin.hostname ===
      "localhost" ||
    origin.hostname ===
      "127.0.0.1" ||
    origin.hostname ===
      "::1";

  if (
    origin.protocol !==
      "https:" &&
    !loopback
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner requires HTTPS outside loopback development.",
    );
  }

  return origin;
}

function requireSharedSecret(): string {
  const secret =
    process.env
      .URL_SAFETY_SCANNER_SHARED_SECRET;

  if (
    !secret ||
    secret.length < 32 ||
    /[\u0000-\u001f\u007f]/.test(
      secret,
    )
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner shared secret is invalid.",
    );
  }

  return secret;
}

function createSignature(
  secret: string,
  timestamp: string,
  body: string,
): string {
  return createHmac(
    "sha256",
    secret,
  )
    .update(
      `${timestamp}\n${body}`,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function requireJsonResponseContentType(
  response: Response,
): void {
  const rawContentType =
    response.headers.get(
      "content-type",
    );

  const mediaType =
    rawContentType
      ?.split(
        ";",
        1,
      )[0]
      ?.trim()
      .toLowerCase();

  if (
    mediaType !==
    "application/json"
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner returned an unexpected content type.",
    );
  }
}

async function readBoundedResponseBody(
  response: Response,
): Promise<string> {
  if (!response.body) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner returned no response body.",
    );
  }

  const reader =
    response.body.getReader();

  const chunks:
    Uint8Array[] = [];

  let totalBytes =
    0;

  try {
    while (true) {
      const result =
        await reader.read();

      if (result.done) {
        break;
      }

      const chunk =
        result.value;

      totalBytes +=
        chunk.byteLength;

      if (
        totalBytes >
        MAX_RESPONSE_BYTES
      ) {
        try {
          await reader.cancel();
        } catch {
          /*
           * The response is already rejected.
           * Cancellation failure must never turn
           * an oversized body into trusted input.
           */
        }

        throw new ExternalDestinationScannerError(
          "URL Safety Scanner response exceeded the allowed size.",
        );
      }

      chunks.push(
        chunk,
      );
    }
  } finally {
    reader.releaseLock();
  }

  const bytes =
    new Uint8Array(
      totalBytes,
    );

  let offset =
    0;

  for (const chunk of chunks) {
    bytes.set(
      chunk,
      offset,
    );

    offset +=
      chunk.byteLength;
  }

  try {
    return new TextDecoder(
      "utf-8",
      {
        fatal: true,
      },
    ).decode(
      bytes,
    );
  } catch {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner returned invalid UTF-8.",
    );
  }
}

function validateBinding(
  requestedUrl: string,
  verdict:
    z.infer<
      typeof scannerResponseSchema
    >,
): void {
  if (
    verdict.hops.length ===
    0
  ) {
    /*
     * Pre-network Web Risk decisions may legitimately
     * have no HTTP hop. In that case checkedUrl must
     * still identify the exact URL that was requested.
     */
    if (
      verdict.checkedUrl !==
      requestedUrl
    ) {
      throw new ExternalDestinationScannerError(
        "URL Safety Scanner returned an unbound destination.",
      );
    }

    if (
      verdict.finalStatusCode !==
      null
    ) {
      throw new ExternalDestinationScannerError(
        "URL Safety Scanner returned an inconsistent pre-network verdict.",
      );
    }

    return;
  }

  const firstHop =
    verdict.hops[0];

  const lastHop =
    verdict.hops[
      verdict.hops.length -
        1
    ];

  if (
    firstHop?.url !==
    requestedUrl
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner response does not begin with the requested URL.",
    );
  }

  if (
    !lastHop ||
    verdict.checkedUrl !==
      lastHop.url
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner final URL binding is invalid.",
    );
  }

  if (
    verdict.finalStatusCode !==
    lastHop.statusCode
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner final status binding is invalid.",
    );
  }
}

function validateVerdictConsistency(
  verdict:
    z.infer<
      typeof scannerResponseSchema
    >,
): void {
  if (
    verdict.status ===
    "clear"
  ) {
    /*
     * "clear" is the only scanner result that may
     * later become persisted database status
     * "safe".
     *
     * Treat that word as a strict security
     * invariant rather than trusting the scanner
     * status field by itself.
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
      throw new ExternalDestinationScannerError(
        "URL Safety Scanner returned an inconsistent clear verdict.",
      );
    }

    return;
  }

  /*
   * A completed review/blocked verdict without
   * an explanation is not useful as trusted
   * security evidence.
   *
   * Keep it fail-closed rather than allowing a
   * semantically incomplete verdict to reach the
   * persistence boundary.
   */
  if (
    verdict.reasonCodes.length ===
    0
  ) {
    throw new ExternalDestinationScannerError(
      "URL Safety Scanner returned an unexplained non-safe verdict.",
    );
  }
}

export async function scanExternalDestination(
  normalizedUrl: string,
): Promise<ExternalDestinationScannerVerdict> {
  const origin =
    requireScannerOrigin();

  const secret =
    requireSharedSecret();

  const endpoint =
    new URL(
      "/api/scan",
      origin,
    );

  const body =
    JSON.stringify({
      normalizedUrl,
    });

  const timestamp =
    String(
      Date.now(),
    );

  const signature =
    createSignature(
      secret,
      timestamp,
      body,
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      SCANNER_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method:
            "POST",

          redirect:
            "error",

          cache:
            "no-store",

          signal:
            controller.signal,

          headers: {
            accept:
              "application/json",

            "content-type":
              "application/json",

            "x-spall-timestamp":
              timestamp,

            "x-spall-signature":
              signature,
          },

          body,
        },
      );

    if (!response.ok) {
      throw new ExternalDestinationScannerError(
        "URL Safety Scanner did not complete successfully.",
      );
    }

    requireJsonResponseContentType(
      response,
    );

    const declaredLength =
      response.headers.get(
        "content-length",
      );

    if (
      declaredLength !==
        null
    ) {
      const length =
        Number(
          declaredLength,
        );

      if (
        !Number.isSafeInteger(
          length,
        ) ||
        length < 0 ||
        length >
          MAX_RESPONSE_BYTES
      ) {
        throw new ExternalDestinationScannerError(
          "URL Safety Scanner response size is invalid.",
        );
      }
    }

    /*
     * Do not call response.text() here.
     *
     * The scanner is a security boundary and a
     * malicious or compromised upstream must not
     * make the web process buffer an arbitrarily
     * large response before the size check runs.
     */
    const raw =
      await readBoundedResponseBody(
        response,
      );

    let decoded:
      unknown;

    try {
      decoded =
        JSON.parse(
          raw,
        );
    } catch {
      throw new ExternalDestinationScannerError(
        "URL Safety Scanner returned malformed JSON.",
      );
    }

    const parsed =
      scannerResponseSchema
        .safeParse(
          decoded,
        );

    if (!parsed.success) {
      throw new ExternalDestinationScannerError(
        "URL Safety Scanner returned an invalid response.",
      );
    }

    validateBinding(
      normalizedUrl,
      parsed.data,
    );

    validateVerdictConsistency(
      parsed.data,
    );

    return {
      status:
        parsed.data.status,

      checkedUrl:
        parsed.data.checkedUrl,

      finalStatusCode:
        parsed.data.finalStatusCode,

      hops:
        parsed.data.hops,

      reasonCodes:
        parsed.data.reasonCodes,

      riskSignals:
        parsed.data.riskSignals,
    };
  } catch (error) {
    if (
      error instanceof
      ExternalDestinationScannerError
    ) {
      throw error;
    }

    throw new ExternalDestinationScannerError(
      "URL Safety Scanner request failed closed.",
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}