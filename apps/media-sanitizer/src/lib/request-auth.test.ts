import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createSanitizerSignature,
  verifySanitizerSignature,
} from "./request-auth";

const SECRET =
  "0123456789abcdef0123456789abcdef";

const BODY =
  '{"sourceUrl":"https://example.test/object"}';

describe(
  "sanitizer request authentication",
  () => {
    it(
      "accepts a valid short-lived HMAC",
      () => {
        const now =
          1_800_000_000_000;

        const timestamp =
          String(now);

        const signature =
          createSanitizerSignature({
            secret: SECRET,
            timestamp,
            body: BODY,
          });

        expect(
          verifySanitizerSignature({
            secret: SECRET,
            timestamp,
            signature,
            body: BODY,
            nowMilliseconds:
              now,
          }),
        ).toBe(true);
      },
    );

    it(
      "rejects body tampering",
      () => {
        const now =
          1_800_000_000_000;

        const timestamp =
          String(now);

        const signature =
          createSanitizerSignature({
            secret: SECRET,
            timestamp,
            body: BODY,
          });

        expect(
          verifySanitizerSignature({
            secret: SECRET,
            timestamp,
            signature,
            body:
              BODY + "tampered",
            nowMilliseconds:
              now,
          }),
        ).toBe(false);
      },
    );

    it(
      "rejects expired signatures",
      () => {
        const timestamp =
          "1800000000000";

        const signature =
          createSanitizerSignature({
            secret: SECRET,
            timestamp,
            body: BODY,
          });

        expect(
          verifySanitizerSignature({
            secret: SECRET,
            timestamp,
            signature,
            body: BODY,
            nowMilliseconds:
              1_800_000_120_000,
          }),
        ).toBe(false);
      },
    );

    it(
      "rejects malformed signatures",
      () => {
        expect(
          verifySanitizerSignature({
            secret: SECRET,
            timestamp:
              "1800000000000",
            signature:
              "not-a-signature",
            body: BODY,
            nowMilliseconds:
              1_800_000_000_000,
          }),
        ).toBe(false);
      },
    );
  },
);