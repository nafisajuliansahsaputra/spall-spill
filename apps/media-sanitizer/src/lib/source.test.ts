import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateStagingSourceUrl,
} from "./source";

const ORIGIN =
  "https://spall-media.account.r2.cloudflarestorage.com";

describe(
  "sanitizer staging source boundary",
  () => {
    it(
      "accepts an exact allowed HTTPS origin with signed query parameters",
      () => {
        const result =
          validateStagingSourceUrl({
            sourceUrl:
              `${ORIGIN}/staging/profile/a?X-Amz-Signature=test`,
            allowedOrigin:
              ORIGIN,
          });

        expect(
          result.origin,
        ).toBe(ORIGIN);
      },
    );

    it.each([
      "http://spall-media.account.r2.cloudflarestorage.com/object",
      "https://evil.example/object",
      "https://spall-media.account.r2.cloudflarestorage.com.evil.example/object",
      "https://user:pass@spall-media.account.r2.cloudflarestorage.com/object",
    ])(
      "rejects unsafe source %s",
      (sourceUrl) => {
        expect(() =>
          validateStagingSourceUrl({
            sourceUrl,
            allowedOrigin:
              ORIGIN,
          }),
        ).toThrow();
      },
    );

    it(
      "rejects a fragment-bearing source",
      () => {
        expect(() =>
          validateStagingSourceUrl({
            sourceUrl:
              `${ORIGIN}/object#evil`,
            allowedOrigin:
              ORIGIN,
          }),
        ).toThrow();
      },
    );
  },
);