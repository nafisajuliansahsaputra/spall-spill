import {
  normalizeExternalDestination,
} from "@spall-spill/external-destination-policy";

import {
  getUrlSafetyScannerEnv,
} from "../../../lib/env";
import {
  verifyScannerSignature,
} from "../../../lib/request-auth";
import {
  inspectRedirectChain,
} from "../../../lib/redirect-walker";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  15;

const MAX_REQUEST_BODY_BYTES =
  8 * 1024;

function reject(
  status = 400,
): Response {
  return new Response(
    null,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

function jsonResponse(
  body: unknown,
): Response {
  return Response.json(
    body,
    {
      status: 200,
      headers: {
        "Cache-Control":
          "no-store",
        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}

export async function POST(
  request: Request,
): Promise<Response> {
  const declaredRequestLength =
    request.headers.get(
      "content-length",
    );

  if (
    declaredRequestLength &&
    (
      !/^\d+$/.test(
        declaredRequestLength,
      ) ||
      Number(
        declaredRequestLength,
      ) >
        MAX_REQUEST_BODY_BYTES
    )
  ) {
    return reject(413);
  }

  let body: string;

  try {
    body =
      await request.text();
  } catch {
    return reject();
  }

  if (
    Buffer.byteLength(
      body,
      "utf8",
    ) >
      MAX_REQUEST_BODY_BYTES
  ) {
    return reject(413);
  }

  let env;

  try {
    env =
      getUrlSafetyScannerEnv();
  } catch {
    return reject(503);
  }

  const authenticated =
    verifyScannerSignature({
      secret:
        env.sharedSecret,

      timestamp:
        request.headers.get(
          "x-spall-timestamp",
        ),

      signature:
        request.headers.get(
          "x-spall-signature",
        ),

      body,
    });

  if (!authenticated) {
    return reject(401);
  }

  let payload: unknown;

  try {
    payload =
      JSON.parse(body);
  } catch {
    return reject();
  }

  if (
    !payload ||
    typeof payload !==
      "object" ||
    Array.isArray(payload)
  ) {
    return reject();
  }

  const record =
    payload as Record<
      string,
      unknown
    >;

  if (
    Object.keys(record).length !==
      1 ||
    typeof record.normalizedUrl !==
      "string"
  ) {
    return reject();
  }

  let normalizedUrl: string;

  try {
    const normalized =
      normalizeExternalDestination(
        record.normalizedUrl,
      );

    normalizedUrl =
      normalized.normalizedUrl;

    if (
      normalizedUrl !==
      record.normalizedUrl
    ) {
      return reject();
    }
  } catch {
    return reject();
  }

  try {
    const verdict =
      await inspectRedirectChain(
        normalizedUrl,
        {
          semanticApiKey:
            env.geminiApiKey,
        },
      );

    return jsonResponse({
      layer:
        "destination_network",

      status:
        verdict.status,

      checkedUrl:
        verdict.checkedUrl,

      finalStatusCode:
        verdict.finalStatusCode,

      hops:
        verdict.hops,

      reasonCodes:
        verdict.reasonCodes,

      riskSignals:
        verdict.riskSignals,
    });
  } catch {
    /*
     * Threat-provider, DNS, transport,
     * redirect-policy, or other inspection
     * failure is never converted into a
     * clear/safe verdict.
     */
    return reject(503);
  }
}