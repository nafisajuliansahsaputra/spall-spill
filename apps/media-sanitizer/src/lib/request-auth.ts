import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import {
  PROFILE_MEDIA_SANITIZER_SIGNATURE_TTL_SECONDS,
} from "@spall-spill/profile-media-policy";

const SIGNATURE_PATTERN =
  /^[0-9a-f]{64}$/;

export function createSanitizerSignature(
  input: Readonly<{
    secret: string;
    timestamp: string;
    body: string;
  }>,
): string {
  return createHmac(
    "sha256",
    input.secret,
  )
    .update(
      `${input.timestamp}\n${input.body}`,
      "utf8",
    )
    .digest("hex");
}

export function verifySanitizerSignature(
  input: Readonly<{
    secret: string;
    timestamp: string | null;
    signature: string | null;
    body: string;
    nowMilliseconds?: number;
  }>,
): boolean {
  if (
    !input.timestamp ||
    !input.signature ||
    !/^\d{13}$/.test(
      input.timestamp,
    ) ||
    !SIGNATURE_PATTERN.test(
      input.signature,
    )
  ) {
    return false;
  }

  const timestamp =
    Number(input.timestamp);

  if (
    !Number.isSafeInteger(
      timestamp,
    )
  ) {
    return false;
  }

  const now =
    input.nowMilliseconds ??
    Date.now();

  const maximumSkew =
    PROFILE_MEDIA_SANITIZER_SIGNATURE_TTL_SECONDS *
    1000;

  if (
    Math.abs(
      now - timestamp,
    ) > maximumSkew
  ) {
    return false;
  }

  const expected =
    createSanitizerSignature({
      secret:
        input.secret,
      timestamp:
        input.timestamp,
      body:
        input.body,
    });

  const suppliedBuffer =
    Buffer.from(
      input.signature,
      "hex",
    );

  const expectedBuffer =
    Buffer.from(
      expected,
      "hex",
    );

  if (
    suppliedBuffer.byteLength !==
    expectedBuffer.byteLength
  ) {
    return false;
  }

  return timingSafeEqual(
    suppliedBuffer,
    expectedBuffer,
  );
}