import {
  isIP,
} from "node:net";

export const EXTERNAL_DESTINATION_MAX_LENGTH =
  2048;

export type ExternalDestinationRiskSignal =
  | "http_transport"
  | "punycode_hostname";

export type ExternalDestinationPolicyResult =
  Readonly<{
    normalizedUrl: string;
    hostname: string;
    protocol:
      | "http:"
      | "https:";
    riskSignals:
      readonly ExternalDestinationRiskSignal[];
  }>;

export class ExternalDestinationPolicyError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "ExternalDestinationPolicyError";
  }
}

function reject(
  message: string,
): never {
  throw new ExternalDestinationPolicyError(
    message,
  );
}

function assertSafeRawInput(
  value: string,
): void {
  if (
    value.length < 8 ||
    value.length >
      EXTERNAL_DESTINATION_MAX_LENGTH
  ) {
    reject(
      "External destination length is invalid.",
    );
  }

  /*
   * Do not silently trim hostile or ambiguous input.
   * What the user submitted must be exactly what
   * reaches URL parsing.
   */
  if (
    value !== value.trim()
  ) {
    reject(
      "External destination contains surrounding whitespace.",
    );
  }

  if (
    /[\u0000-\u001f\u007f\s\\]/u.test(
      value,
    )
  ) {
    reject(
      "External destination contains forbidden characters.",
    );
  }
}

function assertSafeHostname(
  hostname: string,
): void {
  if (
    !hostname ||
    hostname.endsWith(".")
  ) {
    reject(
      "External destination hostname is invalid.",
    );
  }

  if (
    isIP(hostname) !== 0
  ) {
    reject(
      "Direct IP destinations are not accepted.",
    );
  }

  const lower =
    hostname.toLowerCase();

  if (
    lower === "localhost" ||
    lower.endsWith(
      ".localhost",
    ) ||
    lower.endsWith(
      ".local",
    ) ||
    lower.endsWith(
      ".internal",
    ) ||
    lower === "home.arpa" ||
    lower.endsWith(
      ".home.arpa",
    )
  ) {
    reject(
      "Local or private hostnames are not accepted.",
    );
  }

  /*
   * External destinations require a DNS-style
   * hostname, not a single-label internal name.
   */
  if (!lower.includes(".")) {
    reject(
      "Single-label hostnames are not accepted.",
    );
  }

  if (
    lower.length > 253 ||
    lower
      .split(".")
      .some(
        (label) =>
          label.length < 1 ||
          label.length > 63 ||
          !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(
            label,
          ),
      )
  ) {
    reject(
      "External destination hostname structure is invalid.",
    );
  }
}

function assertSafePort(
  url: URL,
): void {
  if (!url.port) {
    return;
  }

  if (
    (
      url.protocol === "http:" &&
      url.port === "80"
    ) ||
    (
      url.protocol === "https:" &&
      url.port === "443"
    )
  ) {
    return;
  }

  reject(
    "External destination uses a non-standard port.",
  );
}

export function normalizeExternalDestination(
  value: string,
): ExternalDestinationPolicyResult {
  assertSafeRawInput(value);

  let url: URL;

  try {
    url =
      new URL(value);
  } catch {
    reject(
      "External destination is not a valid URL.",
    );
  }

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    reject(
      "Only HTTP and HTTPS destinations are accepted.",
    );
  }

  if (
    url.username ||
    url.password
  ) {
    reject(
      "Credential-bearing URLs are not accepted.",
    );
  }

  /*
   * Fragments are deliberately rejected at the
   * safety boundary. They are not sent to the
   * origin server and can therefore alter SPA
   * behavior without being visible to ordinary
   * server-side reputation/redirect inspection.
   */
  if (url.hash) {
    reject(
      "Fragment-bearing URLs require manual review and are not accepted.",
    );
  }

  assertSafeHostname(
    url.hostname,
  );

  assertSafePort(url);

  const riskSignals:
    ExternalDestinationRiskSignal[] =
      [];

  if (
    url.protocol === "http:"
  ) {
    riskSignals.push(
      "http_transport",
    );
  }

  if (
    url.hostname
      .toLowerCase()
      .split(".")
      .some(
        (label) =>
          label.startsWith(
            "xn--",
          ),
      )
  ) {
    /*
     * IDNs are not automatically malicious, so we
     * preserve them but require downstream safety
     * review instead of silently blocking them.
     */
    riskSignals.push(
      "punycode_hostname",
    );
  }

  return {
    normalizedUrl:
      url.href,

    hostname:
      url.hostname
        .toLowerCase(),

    protocol:
      url.protocol,

    riskSignals,
  };
}