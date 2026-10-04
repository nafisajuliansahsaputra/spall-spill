const WEB_RISK_LOOKUP_ORIGIN =
  "https://webrisk.googleapis.com";

const WEB_RISK_LOOKUP_PATH =
  "/v1/uris:search";

const WEB_RISK_TIMEOUT_MS =
  5_000;

const WEB_RISK_THREAT_TYPES = [
  "MALWARE",
  "SOCIAL_ENGINEERING",
  "UNWANTED_SOFTWARE",
  "SOCIAL_ENGINEERING_EXTENDED_COVERAGE",
] as const;

type WebRiskThreatType =
  (typeof WEB_RISK_THREAT_TYPES)[number];

export type WebRiskVerdict =
  | Readonly<{
      status: "clear";
      reasonCodes: readonly [];
    }>
  | Readonly<{
      status: "review";
      reasonCodes:
        readonly string[];
    }>
  | Readonly<{
      status: "blocked";
      reasonCodes:
        readonly string[];
    }>;

export class WebRiskLookupError
  extends Error {
  constructor(message: string) {
    super(message);

    this.name =
      "WebRiskLookupError";
  }
}

function getApiKey(): string {
  const value =
    process.env
      .GOOGLE_WEB_RISK_API_KEY
      ?.trim();

  if (!value) {
    throw new WebRiskLookupError(
      "GOOGLE_WEB_RISK_API_KEY is required.",
    );
  }

  return value;
}

function isThreatType(
  value: unknown,
): value is WebRiskThreatType {
  return (
    typeof value === "string" &&
    WEB_RISK_THREAT_TYPES.includes(
      value as WebRiskThreatType,
    )
  );
}

function parseThreatTypes(
  value: unknown,
): WebRiskThreatType[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("threat" in value)
  ) {
    return [];
  }

  const threat =
    (
      value as {
        threat?: unknown;
      }
    ).threat;

  if (
    typeof threat !== "object" ||
    threat === null ||
    !("threatTypes" in threat)
  ) {
    return [];
  }

  const threatTypes =
    (
      threat as {
        threatTypes?: unknown;
      }
    ).threatTypes;

  if (!Array.isArray(threatTypes)) {
    throw new WebRiskLookupError(
      "Web Risk returned an invalid threatTypes response.",
    );
  }

  if (
    threatTypes.some(
      (value) =>
        !isThreatType(value),
    )
  ) {
    throw new WebRiskLookupError(
      "Web Risk returned an unknown threat type.",
    );
  }

  return [
    ...new Set(
      threatTypes,
    ),
  ];
}

function mapThreats(
  threats: readonly WebRiskThreatType[],
): WebRiskVerdict {
  const hardThreats =
    threats.filter(
      (threat) =>
        threat !==
        "SOCIAL_ENGINEERING_EXTENDED_COVERAGE",
    );

  if (hardThreats.length > 0) {
    return {
      status:
        "blocked",

      reasonCodes:
        hardThreats.map(
          (threat) =>
            `web_risk:${threat.toLowerCase()}`,
        ),
    };
  }

  if (
    threats.includes(
      "SOCIAL_ENGINEERING_EXTENDED_COVERAGE",
    )
  ) {
    return {
      status:
        "review",

      reasonCodes: [
        "web_risk:social_engineering_extended_coverage",
      ],
    };
  }

  return {
    status:
      "clear",

    reasonCodes: [],
  };
}

function resolveWebRiskTimeout(
  timeoutMs:
    number | undefined,
): number {
  if (
    timeoutMs === undefined
  ) {
    return WEB_RISK_TIMEOUT_MS;
  }

  if (
    !Number.isFinite(
      timeoutMs,
    ) ||
    timeoutMs <= 0
  ) {
    throw new WebRiskLookupError(
      "Web Risk lookup received an invalid timeout.",
    );
  }

  return Math.max(
    1,
    Math.min(
      timeoutMs,
      Math.floor(
        timeoutMs,
      ),
    ),
  );
}

export async function lookupWebRisk(
  normalizedUrl: string,
  options: Readonly<{
    timeoutMs?: number;
  }> = {},
): Promise<WebRiskVerdict> {
  const endpoint =
    new URL(
      WEB_RISK_LOOKUP_PATH,
      WEB_RISK_LOOKUP_ORIGIN,
    );

  endpoint.searchParams.set(
    "uri",
    normalizedUrl,
  );

  for (
    const threatType
    of WEB_RISK_THREAT_TYPES
  ) {
    endpoint.searchParams.append(
      "threatTypes",
      threatType,
    );
  }

  endpoint.searchParams.set(
    "key",
    getApiKey(),
  );

  const timeoutMs =
    resolveWebRiskTimeout(
      options.timeoutMs,
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method:
            "GET",

          redirect:
            "error",

          cache:
            "no-store",

          signal:
            controller.signal,

          headers: {
            accept:
              "application/json",
          },
        },
      );

    if (!response.ok) {
      throw new WebRiskLookupError(
        "Web Risk lookup failed.",
      );
    }

    let payload:
      unknown;

    try {
      payload =
        await response.json();
    } catch {
      throw new WebRiskLookupError(
        "Web Risk returned invalid JSON.",
      );
    }

    return mapThreats(
      parseThreatTypes(
        payload,
      ),
    );
  } catch (error) {
    if (
      error instanceof
        WebRiskLookupError
    ) {
      throw error;
    }

    throw new WebRiskLookupError(
      "Web Risk lookup could not be completed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}