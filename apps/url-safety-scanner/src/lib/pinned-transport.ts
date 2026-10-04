import {
  request as httpRequest,
} from "node:http";

import {
  request as httpsRequest,
  type RequestOptions,
} from "node:https";

import {
  normalizeExternalDestination,
} from "@spall-spill/external-destination-policy";

import {
  isPublicIpAddress,
  type ResolvedPublicAddress,
} from "./network-safety";

const REQUEST_TIMEOUT_MS =
  5_000;

const MAX_RESPONSE_HEADER_BYTES =
  16 * 1024;

export const PINNED_DOCUMENT_MAX_BYTES =
  256 * 1024;

const INSPECTABLE_CONTENT_TYPES =
  new Set([
    "text/html",
    "application/xhtml+xml",
    "text/plain",
  ]);

const USER_AGENT =
  "SpallSpill-URLSafetyScanner/1.0";

export type PinnedResponseHeaders =
  Readonly<{
    statusCode: number;
    location: string | null;
    contentType: string | null;
    contentLength: string | null;
  }>;

export type PinnedDocument =
  Readonly<{
    statusCode: number;
    contentType: string;
    byteSize: number;
    text: string;
  }>;

export type PinnedInspection =
  | Readonly<{
      kind:
        "redirect";

      headers:
        PinnedResponseHeaders;
    }>
  | Readonly<{
      kind:
        "document";

      headers:
        PinnedResponseHeaders;

      document:
        PinnedDocument;
    }>;

export class PinnedTransportError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "PinnedTransportError";
  }
}

function resolveRequestTimeout(
  timeoutMs: number,
): number {
  if (
    !Number.isFinite(
      timeoutMs,
    ) ||
    timeoutMs <= 0
  ) {
    throw new PinnedTransportError(
      "Pinned transport received an invalid request timeout.",
    );
  }

  return Math.max(
    1,
    Math.min(
      REQUEST_TIMEOUT_MS,
      Math.floor(
        timeoutMs,
      ),
    ),
  );
}

export function createPinnedRequestOptions(
  normalizedUrl: string,
  pinnedAddress:
    ResolvedPublicAddress,
  timeoutMs:
    number = REQUEST_TIMEOUT_MS,
): RequestOptions {
  let normalized;

  try {
    normalized =
      normalizeExternalDestination(
        normalizedUrl,
      );
  } catch {
    throw new PinnedTransportError(
      "Pinned transport received an unsafe destination.",
    );
  }

  if (
    normalized.normalizedUrl !==
    normalizedUrl
  ) {
    throw new PinnedTransportError(
      "Pinned transport requires an exact canonical destination.",
    );
  }

  if (
    !isPublicIpAddress(
      pinnedAddress.address,
    )
  ) {
    throw new PinnedTransportError(
      "Pinned transport requires a public network address.",
    );
  }

  if (
    pinnedAddress.family !== 4 &&
    pinnedAddress.family !== 6
  ) {
    throw new PinnedTransportError(
      "Pinned transport received an invalid address family.",
    );
  }

  const target =
    new URL(
      normalizedUrl,
    );

  const protocol =
    target.protocol;

  if (
    protocol !== "http:" &&
    protocol !== "https:"
  ) {
    throw new PinnedTransportError(
      "Pinned transport supports only HTTP and HTTPS.",
    );
  }

  const port =
    target.port
      ? Number(target.port)
      : protocol === "https:"
        ? 443
        : 80;

  return {
    protocol,

    hostname:
      target.hostname,

    port,

    method:
      "GET",

    path:
      `${target.pathname}${target.search}`,

    agent:
      false,

    maxHeaderSize:
      MAX_RESPONSE_HEADER_BYTES,

    timeout:
      resolveRequestTimeout(
        timeoutMs,
      ),

    servername:
      protocol === "https:"
        ? target.hostname
        : undefined,

    rejectUnauthorized:
      protocol === "https:"
        ? true
        : undefined,

    headers: {
      Host:
        target.host,

      Accept:
        "text/html,application/xhtml+xml,*/*;q=0.1",

      "User-Agent":
        USER_AGENT,

      /*
       * Node does not auto-decompress these
       * responses. Explicit identity encoding
       * also prevents compressed-content bombs
       * from entering the content-inspection
       * path.
       */
      "Accept-Encoding":
        "identity",

      Connection:
        "close",
    },

    /*
     * Security boundary:
     *
     * Node receives the original hostname for TLS
     * verification and Host/SNI semantics, but its
     * network lookup is pinned to the exact address
     * that our DNS safety layer already approved.
     *
     * No second system DNS resolution is allowed.
     */
    lookup: (
      _hostname,
      _options,
      callback,
    ) => {
      callback(
        null,
        pinnedAddress.address,
        pinnedAddress.family,
      );
    },
  };
}

async function requestOneAddress(
  normalizedUrl: string,
  pinnedAddress:
    ResolvedPublicAddress,
  timeoutMs: number,
): Promise<PinnedResponseHeaders> {
  const options =
    createPinnedRequestOptions(
      normalizedUrl,
      pinnedAddress,
      timeoutMs,
    );

  const requestImplementation =
    options.protocol === "https:"
      ? httpsRequest
      : httpRequest;

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      let settled =
        false;

      const fail =
        (message: string) => {
          if (settled) {
            return;
          }

          settled =
            true;

          reject(
            new PinnedTransportError(
              message,
            ),
          );
        };

      const request =
        requestImplementation(
          options,
          (response) => {
            if (settled) {
              response.destroy();

              return;
            }


            const statusCode =
              response.statusCode;

            if (
              typeof statusCode !==
                "number"
            ) {
              response.destroy();

              fail(
                "Pinned destination returned no HTTP status.",
              );

              return;
            }

            settled =
              true;

            const result:
              PinnedResponseHeaders = {
                statusCode,

                location:
                  typeof response
                    .headers.location ===
                    "string"
                    ? response
                        .headers.location
                    : null,

                contentType:
                  typeof response
                    .headers[
                      "content-type"
                    ] === "string"
                    ? response
                        .headers[
                          "content-type"
                        ]!
                    : null,

                contentLength:
                  typeof response
                    .headers[
                      "content-length"
                    ] === "string"
                    ? response
                        .headers[
                          "content-length"
                        ]!
                    : null,
              };

            /*
             * Redirect inspection only needs
             * response headers at this stage.
             * Destroy immediately so an attacker
             * cannot force us to download an
             * unbounded response body.
             */
            response.destroy();

            resolve(result);
          },
        );

      request.once(
        "timeout",
        () => {
          request.destroy(
            new Error(
              "Pinned request timed out.",
            ),
          );
        },
      );

      request.once(
        "error",
        () => {
          fail(
            "Pinned destination request failed.",
          );
        },
      );

      request.end();
    },
  );
}

export async function requestPinnedHeaders(
  normalizedUrl: string,
  addresses:
    readonly ResolvedPublicAddress[],
  timeoutMs:
    number = REQUEST_TIMEOUT_MS,
): Promise<PinnedResponseHeaders> {
  if (addresses.length === 0) {
    throw new PinnedTransportError(
      "Pinned transport requires at least one validated address.",
    );
  }

  const deadlineAt =
    Date.now() +
    resolveRequestTimeout(
      timeoutMs,
    );

  let lastError:
    unknown = null;

  for (const address of addresses) {
    const remainingMs =
      deadlineAt -
      Date.now();

    if (
      remainingMs <= 0
    ) {
      break;
    }

    try {
      return await requestOneAddress(
        normalizedUrl,
        address,
        remainingMs,
      );
    } catch (error) {
      if (
        error instanceof
          PinnedInspectionAttemptError &&
        error.retryableBeforeResponse
      ) {
        /*
         * No HTTP response was observed from
         * this validated address. A connection-
         * level failure may therefore try the
         * next already-validated address within
         * the same wall-clock deadline.
         */
        lastError =
          error;

        continue;
      }

      /*
       * Once any HTTP response was received,
       * backend switching could allow different
       * addresses to equivocate about status or
       * content. Fail closed immediately.
       */
      if (
        error instanceof
        PinnedTransportError
      ) {
        throw error;
      }

      throw new PinnedTransportError(
        "Pinned destination inspection failed closed.",
      );
    }
  }

  throw new PinnedTransportError(
    lastError instanceof Error
      ? lastError.message
      : "All validated destination addresses failed.",
  );
}

function parseInspectableContentType(
  rawContentType:
    string | undefined,
): string {
  if (!rawContentType) {
    throw new PinnedTransportError(
      "Destination did not provide an inspectable Content-Type.",
    );
  }

  const mediaType =
    rawContentType
      .split(
        ";",
        1,
      )[0]
      ?.trim()
      .toLowerCase();

  if (
    !mediaType ||
    !INSPECTABLE_CONTENT_TYPES.has(
      mediaType,
    )
  ) {
    throw new PinnedTransportError(
      "Destination returned a non-inspectable content type.",
    );
  }

  return mediaType;
}

function parseBoundedContentLength(
  rawContentLength:
    string | undefined,
): number | null {
  if (!rawContentLength) {
    return null;
  }

  if (
    !/^\d+$/.test(
      rawContentLength,
    )
  ) {
    throw new PinnedTransportError(
      "Destination returned an invalid Content-Length.",
    );
  }

  const contentLength =
    Number(
      rawContentLength,
    );

  if (
    !Number.isSafeInteger(
      contentLength,
    ) ||
    contentLength >
      PINNED_DOCUMENT_MAX_BYTES
  ) {
    throw new PinnedTransportError(
      "Destination document exceeds the inspection size limit.",
    );
  }

  return contentLength;
}

function validateIdentityEncoding(
  rawContentEncoding:
    string | undefined,
): void {
  if (
    !rawContentEncoding
  ) {
    return;
  }

  const encodings =
    rawContentEncoding
      .split(",")
      .map(
        (value) =>
          value
            .trim()
            .toLowerCase(),
      )
      .filter(Boolean);

  if (
    encodings.length !== 1 ||
    encodings[0] !== "identity"
  ) {
    throw new PinnedTransportError(
      "Destination returned compressed or unsupported content encoding.",
    );
  }
}

class PinnedInspectionAttemptError
  extends PinnedTransportError {
  readonly retryableBeforeResponse:
    boolean;

  constructor(
    message: string,
    retryableBeforeResponse:
      boolean,
  ) {
    super(message);

    this.name =
      "PinnedInspectionAttemptError";

    this.retryableBeforeResponse =
      retryableBeforeResponse;
  }
}

async function requestOneInspection(
  normalizedUrl: string,
  pinnedAddress:
    ResolvedPublicAddress,
  timeoutMs: number,
): Promise<PinnedInspection> {
  const options =
    createPinnedRequestOptions(
      normalizedUrl,
      pinnedAddress,
      timeoutMs,
    );

  const requestImplementation =
    options.protocol === "https:"
      ? httpsRequest
      : httpRequest;

  return new Promise(
    (
      resolve,
      reject,
    ) => {
      let settled =
        false;

      /*
       * Retry across prevalidated addresses is
       * allowed only before any HTTP response has
       * been observed.
       *
       * Once response headers begin arriving,
       * that response becomes authoritative for
       * this hop. Any later validation, body,
       * timeout, abort, or transport failure must
       * fail closed rather than switching to a
       * different backend address.
       */
      let responseReceived =
        false;

      const fail =
        (
          message: string,
          response?: {
            destroy:
              () => void;
          },
        ) => {
          if (settled) {
            return;
          }

          settled =
            true;

          response?.destroy();

          reject(
            new PinnedInspectionAttemptError(
              message,
              !responseReceived,
            ),
          );
        };

      const request =
        requestImplementation(
          options,
          (response) => {
            if (settled) {
              response.destroy();

              return;
            }

            /*
             * From this point onward this exact
             * backend response is authoritative.
             * Never retry another address after
             * any failure below this boundary.
             */
            responseReceived =
              true;

            const statusCode =
              response.statusCode;

            if (
              typeof statusCode !==
                "number"
            ) {
              fail(
                "Pinned destination returned no HTTP status.",
                response,
              );

              return;
            }

            const headers:
              PinnedResponseHeaders = {
                statusCode,

                location:
                  typeof response
                    .headers.location ===
                    "string"
                    ? response
                        .headers.location
                    : null,

                contentType:
                  typeof response
                    .headers[
                      "content-type"
                    ] === "string"
                    ? response
                        .headers[
                          "content-type"
                        ]!
                    : null,

                contentLength:
                  typeof response
                    .headers[
                      "content-length"
                    ] === "string"
                    ? response
                        .headers[
                          "content-length"
                        ]!
                    : null,
              };

            /*
             * Redirect hops require only their
             * status and Location header.
             *
             * Destroy the body immediately so a
             * redirect cannot force an unbounded
             * download. The walker will validate
             * the next URL from zero.
             */
            if (
              statusCode >= 300 &&
              statusCode <= 399
            ) {
              settled =
                true;

              response.destroy();

              resolve({
                kind:
                  "redirect",

                headers,
              });

              return;
            }

            /*
             * A terminal response is inspected
             * from this SAME pinned HTTP response.
             *
             * There is no second terminal request,
             * removing the previous header/body
             * TOCTOU window entirely.
             */
            let contentType:
              string;

            let declaredLength:
              number | null;

            try {
              validateIdentityEncoding(
                typeof response
                  .headers[
                    "content-encoding"
                  ] === "string"
                  ? response
                      .headers[
                        "content-encoding"
                      ]
                  : undefined,
              );

              contentType =
                parseInspectableContentType(
                  typeof response
                    .headers[
                      "content-type"
                    ] === "string"
                    ? response
                        .headers[
                          "content-type"
                        ]
                    : undefined,
                );

              declaredLength =
                parseBoundedContentLength(
                  typeof response
                    .headers[
                      "content-length"
                    ] === "string"
                    ? response
                        .headers[
                          "content-length"
                        ]
                    : undefined,
                );
            } catch (error) {
              fail(
                error instanceof Error
                  ? error.message
                  : "Destination document headers are unsafe.",
                response,
              );

              return;
            }

            const chunks:
              Buffer[] = [];

            let totalBytes =
              0;

            response.on(
              "data",
              (
                chunk:
                  Buffer | string,
              ) => {
                if (settled) {
                  return;
                }

                const bytes =
                  Buffer.isBuffer(
                    chunk,
                  )
                    ? chunk
                    : Buffer.from(
                        chunk,
                      );

                totalBytes +=
                  bytes.byteLength;

                if (
                  totalBytes >
                    PINNED_DOCUMENT_MAX_BYTES
                ) {
                  fail(
                    "Destination document exceeds the inspection size limit.",
                    response,
                  );

                  return;
                }

                chunks.push(
                  bytes,
                );
              },
            );

            response.once(
              "aborted",
              () => {
                fail(
                  "Destination document transfer was aborted.",
                );
              },
            );

            response.once(
              "error",
              () => {
                fail(
                  "Destination document transfer failed.",
                );
              },
            );

            response.once(
              "end",
              () => {
                if (settled) {
                  return;
                }

                if (
                  declaredLength !==
                    null &&
                  declaredLength !==
                    totalBytes
                ) {
                  fail(
                    "Destination document size did not match Content-Length.",
                  );

                  return;
                }

                const bytes =
                  Buffer.concat(
                    chunks,
                    totalBytes,
                  );

                let decodedText:
                  string;

                try {
                  decodedText =
                    new TextDecoder(
                      "utf-8",
                      {
                        fatal:
                          true,
                      },
                    ).decode(
                      bytes,
                    );
                } catch {
                  fail(
                    "Destination document is not valid UTF-8 text.",
                  );

                  return;
                }

                settled =
                  true;

                resolve({
                  kind:
                    "document",

                  headers,

                  document: {
                    statusCode,

                    contentType,

                    byteSize:
                      totalBytes,

                    text:
                      decodedText,
                  },
                });
              },
            );
          },
        );

      request.once(
        "timeout",
        () => {
          request.destroy(
            new Error(
              "Pinned inspection request timed out.",
            ),
          );
        },
      );

      request.once(
        "error",
        () => {
          fail(
            "Pinned destination inspection request failed.",
          );
        },
      );

      request.end();
    },
  );
}

export async function requestPinnedInspection(
  normalizedUrl: string,
  addresses:
    readonly ResolvedPublicAddress[],
  timeoutMs:
    number = REQUEST_TIMEOUT_MS,
): Promise<PinnedInspection> {
  if (addresses.length === 0) {
    throw new PinnedTransportError(
      "Pinned inspection requires at least one validated address.",
    );
  }

  const deadlineAt =
    Date.now() +
    resolveRequestTimeout(
      timeoutMs,
    );

  let lastError:
    unknown = null;

  for (const address of addresses) {
    const remainingMs =
      deadlineAt -
      Date.now();

    if (
      remainingMs <= 0
    ) {
      break;
    }

    try {
      return await requestOneInspection(
        normalizedUrl,
        address,
        remainingMs,
      );
    } catch (error) {
      if (
        error instanceof
          PinnedInspectionAttemptError &&
        error.retryableBeforeResponse
      ) {
        /*
         * No HTTP response was observed from
         * this validated address. A connection-
         * level failure may therefore try the
         * next already-validated address within
         * the same wall-clock deadline.
         */
        lastError =
          error;

        continue;
      }

      /*
       * Once any HTTP response was received,
       * backend switching could allow different
       * addresses to equivocate about status or
       * content. Fail closed immediately.
       */
      if (
        error instanceof
        PinnedTransportError
      ) {
        throw error;
      }

      throw new PinnedTransportError(
        "Pinned destination inspection failed closed.",
      );
    }
  }

  throw new PinnedTransportError(
    lastError instanceof Error
      ? lastError.message
      : "All validated destination addresses failed pinned inspection.",
  );
}

export async function requestPinnedDocument(
  normalizedUrl: string,
  addresses:
    readonly ResolvedPublicAddress[],
  timeoutMs:
    number = REQUEST_TIMEOUT_MS,
): Promise<PinnedDocument> {
  const inspection =
    await requestPinnedInspection(
      normalizedUrl,
      addresses,
      timeoutMs,
    );

  if (
    inspection.kind ===
    "redirect"
  ) {
    throw new PinnedTransportError(
      "Terminal destination changed into a redirect.",
    );
  }

  return inspection.document;
}
