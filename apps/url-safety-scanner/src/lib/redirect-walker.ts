import {
  normalizeExternalDestination,
} from "@spall-spill/external-destination-policy";

import {
  classifyDestinationContent,
  extractInspectableText,
} from "./content-policy";
import {
  resolvePublicHost,
} from "./network-safety";
import {
  requestPinnedInspection,
} from "./pinned-transport";
import {
  classifySemanticDestinationContent,
} from "./semantic-classifier";
import {
  lookupWebRisk,
} from "./web-risk";

const MAX_REDIRECTS =
  5;

const SCAN_DEADLINE_MS =
  12_000;

const REDIRECT_STATUS_CODES =
  new Set([
    301,
    302,
    303,
    307,
    308,
  ]);

const INVALID_LOCATION_PATTERN =
  /[\u0000-\u0020\u007f\\]/;

export type RedirectHop =
  Readonly<{
    url: string;
    statusCode: number;
  }>;

export type RedirectInspectionResult =
  Readonly<{
    status:
      | "clear"
      | "review"
      | "blocked";

    checkedUrl: string;

    finalStatusCode:
      number | null;

    hops:
      readonly RedirectHop[];

    reasonCodes:
      readonly string[];

    riskSignals:
      readonly string[];
  }>;

export class RedirectInspectionError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "RedirectInspectionError";
  }
}

function requireCanonicalUrl(
  rawUrl: string,
): ReturnType<
  typeof normalizeExternalDestination
> {
  let normalized;

  try {
    normalized =
      normalizeExternalDestination(
        rawUrl,
      );
  } catch {
    throw new RedirectInspectionError(
      "Redirect inspection received an unsafe destination.",
    );
  }

  if (
    normalized.normalizedUrl !==
    rawUrl
  ) {
    throw new RedirectInspectionError(
      "Redirect inspection requires an exact canonical destination.",
    );
  }

  return normalized;
}

function resolveRedirectTarget(
  currentUrl: string,
  location: string,
): string {
  if (
    location.length === 0 ||
    INVALID_LOCATION_PATTERN.test(
      location,
    )
  ) {
    throw new RedirectInspectionError(
      "Destination returned an unsafe redirect location.",
    );
  }

  let resolved: URL;

  try {
    resolved =
      new URL(
        location,
        currentUrl,
      );
  } catch {
    throw new RedirectInspectionError(
      "Destination returned an invalid redirect location.",
    );
  }

  let normalized;

  try {
    normalized =
      normalizeExternalDestination(
        resolved.toString(),
      );
  } catch {
    throw new RedirectInspectionError(
      "Destination redirected to an unsafe target.",
    );
  }

  return normalized.normalizedUrl;
}

function validateTerminalStatus(
  statusCode: number,
): void {
  if (
    !Number.isInteger(
      statusCode,
    ) ||
    statusCode < 200 ||
    statusCode > 599
  ) {
    throw new RedirectInspectionError(
      "Destination returned an invalid HTTP status.",
    );
  }

  if (
    statusCode >= 300 &&
    statusCode <= 399
  ) {
    throw new RedirectInspectionError(
      "Destination returned an unsupported redirect status.",
    );
  }
}

function getRiskSignalReasonCodes(
  riskSignals:
    ReadonlySet<string>,
): string[] {
  const reasons:
    string[] = [];

  for (
    const signal
    of riskSignals
  ) {
    switch (signal) {
      case "http_transport":
        reasons.push(
          "destination:http_transport",
        );

        break;

      case "punycode_hostname":
        reasons.push(
          "destination:punycode_hostname",
        );

        break;

      default:
        /*
         * A newly introduced structural signal
         * must be explicitly reviewed here.
         * Unknown signals can never silently
         * become a clear destination.
         */
        throw new RedirectInspectionError(
          "Destination produced an unknown risk signal.",
        );
    }
  }

  return reasons;
}

function remainingScanBudgetMs(
  deadlineAt: number,
): number {
  const remainingMs =
    deadlineAt -
    Date.now();

  if (
    remainingMs <= 0
  ) {
    throw new RedirectInspectionError(
      "Destination inspection exceeded the scan deadline.",
    );
  }

  return remainingMs;
}

export async function inspectRedirectChain(
  initialNormalizedUrl: string,
  options: Readonly<{
    semanticApiKey: string;
  }>,
): Promise<RedirectInspectionResult> {
  const deadlineAt =
    Date.now() +
    SCAN_DEADLINE_MS;

  let currentUrl =
    requireCanonicalUrl(
      initialNormalizedUrl,
    ).normalizedUrl;

  const visited =
    new Set<string>();

  const hops:
    RedirectHop[] = [];

  const riskSignals =
    new Set<string>();

  let redirectCount =
    0;

  while (true) {
    if (
      visited.has(
        currentUrl,
      )
    ) {
      throw new RedirectInspectionError(
        "Destination redirect loop detected.",
      );
    }

    visited.add(
      currentUrl,
    );

    const normalized =
      requireCanonicalUrl(
        currentUrl,
      );

    for (
      const signal
      of normalized.riskSignals
    ) {
      riskSignals.add(
        signal,
      );
    }

    /*
     * Threat intelligence runs before any
     * outbound request for every hop.
     */
    const threatVerdict =
      await lookupWebRisk(
        currentUrl,
        {
          timeoutMs:
            remainingScanBudgetMs(
              deadlineAt,
            ),
        },
      );

    if (
      threatVerdict.status !==
      "clear"
    ) {
      return {
        status:
          threatVerdict.status,

        checkedUrl:
          currentUrl,

        finalStatusCode:
          null,

        hops,

        reasonCodes:
          threatVerdict.reasonCodes,

        riskSignals: [
          ...riskSignals,
        ],
      };
    }

    /*
     * DNS resolves once for this hop.
     * Every returned address must be public.
     */
    /*
     * DNS resolution now receives the remaining
     * scan-wide budget directly.
     *
     * The OS-backed lookup itself has no
     * AbortSignal, but the resolver boundary
     * stops awaiting it when this budget expires
     * and fails closed.
     */
    const addresses =
      await resolvePublicHost(
        normalized.hostname,
        remainingScanBudgetMs(
          deadlineAt,
        ),
      );

    /*
     * Preserve the explicit post-resolution
     * deadline assertion as defense-in-depth.
     */
    remainingScanBudgetMs(
      deadlineAt,
    );

    /*
     * One exact pinned GET represents this hop.
     *
     * Redirects expose only bounded headers;
     * terminal responses expose headers and the
     * bounded body from that same response.
     */
    const inspection =
      await requestPinnedInspection(
        currentUrl,
        addresses,
        remainingScanBudgetMs(
          deadlineAt,
        ),
      );

    const response =
      inspection.headers;

    hops.push({
      url:
        currentUrl,

      statusCode:
        response.statusCode,
    });

    if (
      REDIRECT_STATUS_CODES.has(
        response.statusCode,
      )
    ) {
      if (!response.location) {
        throw new RedirectInspectionError(
          "Destination returned a redirect without a location.",
        );
      }

      if (
        redirectCount >=
        MAX_REDIRECTS
      ) {
        throw new RedirectInspectionError(
          "Destination exceeded the redirect limit.",
        );
      }

      const nextUrl =
        resolveRedirectTarget(
          currentUrl,
          response.location,
        );

      if (
        visited.has(
          nextUrl,
        )
      ) {
        throw new RedirectInspectionError(
          "Destination redirect loop detected.",
        );
      }

      redirectCount +=
        1;

      currentUrl =
        nextUrl;

      continue;
    }

    validateTerminalStatus(
      response.statusCode,
    );

    /*
     * Supported redirects have already continued
     * above, and unsupported 3xx statuses have
     * already failed closed.
     *
     * Therefore a terminal hop must carry the
     * bounded document from this SAME pinned
     * HTTP response. No second terminal request
     * exists anymore.
     */
    if (
      inspection.kind !==
      "document"
    ) {
      throw new RedirectInspectionError(
        "Terminal destination did not provide a bounded document.",
      );
    }

    const document =
      inspection.document;

    const contentVerdict =
      classifyDestinationContent(
        document,
      );

    const structuralReasons =
      getRiskSignalReasonCodes(
        riskSignals,
      );

    /*
     * Only successful 2xx terminal responses
     * may become scanner-clear.
     */
    const terminalStatusReasons =
      document.statusCode >= 200 &&
      document.statusCode <= 299
        ? []
        : [
            "destination:non_success_status",
          ];

    /*
     * Strong deterministic signals do not need
     * a model to override them.
     */
    if (
      contentVerdict.status ===
      "blocked"
    ) {
      return {
        status:
          "blocked",

        checkedUrl:
          currentUrl,

        finalStatusCode:
          document.statusCode,

        hops,

        reasonCodes: [
          ...new Set([
            ...contentVerdict
              .reasonCodes,
            ...structuralReasons,
            ...terminalStatusReasons,
          ]),
        ],

        riskSignals: [
          ...riskSignals,
        ],
      };
    }

    const visibleText =
      extractInspectableText(
        document,
      );

    /*
     * A page with no classifiable visible text
     * cannot become scanner-clear.
     */
    if (
      visibleText.length ===
        0
    ) {
      return {
        status:
          "review",

        checkedUrl:
          currentUrl,

        finalStatusCode:
          document.statusCode,

        hops,

        reasonCodes: [
          ...new Set([
            ...contentVerdict
              .reasonCodes,
            ...structuralReasons,
            ...terminalStatusReasons,
            "content:no_visible_text",
          ]),
        ],

        riskSignals: [
          ...riskSignals,
        ],
      };
    }

    /*
     * Provider failure, timeout, malformed
     * output, or invalid confidence throws.
     * The API boundary converts that failure
     * to fail-closed 503, never clear.
     */
    const semanticVerdict =
      await classifySemanticDestinationContent({
        apiKey:
          options.semanticApiKey,

        text:
          visibleText,

        timeoutMs:
          remainingScanBudgetMs(
            deadlineAt,
          ),
      });

    const reasonCodes = [
      ...new Set([
        ...contentVerdict
          .reasonCodes,

        ...semanticVerdict
          .reasonCodes,

        ...structuralReasons,

        ...terminalStatusReasons,
      ]),
    ];

    let status:
      | "clear"
      | "review"
      | "blocked";

    if (
      semanticVerdict.status ===
      "blocked"
    ) {
      status =
        "blocked";
    } else if (
      contentVerdict.status ===
        "review" ||
      semanticVerdict.status ===
        "review" ||
      structuralReasons.length >
        0 ||
      terminalStatusReasons.length >
        0
    ) {
      status =
        "review";
    } else {
      status =
        "clear";
    }

    return {
      status,

      checkedUrl:
        currentUrl,

      finalStatusCode:
        document.statusCode,

      hops,

      reasonCodes,

      riskSignals: [
        ...riskSignals,
      ],
    };
  }
}