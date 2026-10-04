import {
  getMediaSanitizerEnv,
} from "@/lib/env";
import {
  verifySanitizerSignature,
} from "@/lib/request-auth";
import {
  sanitizeMedia,
} from "@/lib/processor";
import {
  loadUntrustedSource,
  parseExpectedByteSize,
  parseExpectedContentType,
} from "@/lib/source";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  15;

const MAX_REQUEST_BODY_BYTES =
  16 * 1024;

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
      getMediaSanitizerEnv();
  } catch {
    return reject(503);
  }

  const authenticated =
    verifySanitizerSignature({
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

  const contentType =
    parseExpectedContentType(
      record.expectedContentType,
    );

  const byteSize =
    parseExpectedByteSize(
      record.expectedByteSize,
    );

  if (
    !contentType ||
    byteSize === null ||
    typeof record.sourceUrl !==
      "string"
  ) {
    return reject();
  }

  let source: Buffer;

  try {
    source =
      await loadUntrustedSource({
        sourceUrl:
          record.sourceUrl,
        allowedOrigin:
          env.allowedSourceOrigin,
        expectedContentType:
          contentType,
        expectedByteSize:
          byteSize,
      });
  } catch {
    return reject(422);
  }

  let sanitized;

  try {
    sanitized =
      await sanitizeMedia({
        bytes:
          source,
        expectedContentType:
          contentType,
      });
  } catch {
    return reject(422);
  }

  return new Response(
    new Uint8Array(
      sanitized.bytes,
    ),
    {
      status: 200,

      headers: {
        "Content-Type":
          sanitized.contentType,

        "Content-Length":
          String(
            sanitized.byteSize,
          ),

        "X-Spall-Media-Width":
          String(
            sanitized.width,
          ),

        "X-Spall-Media-Height":
          String(
            sanitized.height,
          ),

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",

        "Content-Disposition":
          "inline",
      },
    },
  );
}