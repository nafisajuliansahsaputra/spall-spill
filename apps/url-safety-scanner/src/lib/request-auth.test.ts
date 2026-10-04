import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createScannerSignature,
  verifyScannerSignature,
} from "./request-auth";

const secret =
  "a".repeat(48);

const now =
  1_800_000_000_000;

describe(
  "URL Safety Scanner request authentication",
  () => {
    it(
      "accepts an authentic current request",
      () => {
        const timestamp =
          String(now);

        const body =
          JSON.stringify({
            normalizedUrl:
              "https://example.com/",
          });

        const signature =
          createScannerSignature({
            secret,
            timestamp,
            body,
          });

        expect(
          verifyScannerSignature({
            secret,
            timestamp,
            signature,
            body,
            nowMilliseconds:
              now,
          }),
        ).toBe(true);
      },
    );

    it(
      "rejects missing or malformed authentication",
      () => {
        expect(
          verifyScannerSignature({
            secret,
            timestamp:
              null,
            signature:
              null,
            body:
              "{}",
            nowMilliseconds:
              now,
          }),
        ).toBe(false);

        expect(
          verifyScannerSignature({
            secret,
            timestamp:
              "not-a-timestamp",
            signature:
              "x".repeat(64),
            body:
              "{}",
            nowMilliseconds:
              now,
          }),
        ).toBe(false);
      },
    );

    it(
      "rejects requests outside the 60 second window",
      () => {
        const timestamp =
          String(
            now - 60_001,
          );

        const body =
          "{}";

        const signature =
          createScannerSignature({
            secret,
            timestamp,
            body,
          });

        expect(
          verifyScannerSignature({
            secret,
            timestamp,
            signature,
            body,
            nowMilliseconds:
              now,
          }),
        ).toBe(false);
      },
    );

    it(
      "rejects future requests outside the 60 second window",
      () => {
        const timestamp =
          String(
            now + 60_001,
          );

        const body =
          "{}";

        const signature =
          createScannerSignature({
            secret,
            timestamp,
            body,
          });

        expect(
          verifyScannerSignature({
            secret,
            timestamp,
            signature,
            body,
            nowMilliseconds:
              now,
          }),
        ).toBe(false);
      },
    );

    it(
      "rejects body tampering",
      () => {
        const timestamp =
          String(now);

        const signature =
          createScannerSignature({
            secret,
            timestamp,
            body:
              '{"normalizedUrl":"https://example.com/"}',
          });

        expect(
          verifyScannerSignature({
            secret,
            timestamp,
            signature,
            body:
              '{"normalizedUrl":"https://evil.example/"}',
            nowMilliseconds:
              now,
          }),
        ).toBe(false);
      },
    );
  },
);