import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeExternalDestination,
} from "./index";

describe(
  "external destination security policy",
  () => {
    it(
      "accepts and normalizes an ordinary HTTPS URL",
      () => {
        const result =
          normalizeExternalDestination(
            "https://Example.COM/products/item?id=123&utm_source=spall",
          );

        expect(
          result.normalizedUrl,
        ).toBe(
          "https://example.com/products/item?id=123&utm_source=spall",
        );

        expect(
          result.hostname,
        ).toBe(
          "example.com",
        );

        expect(
          result.riskSignals,
        ).toEqual([]);
      },
    );

    it(
      "allows ordinary HTTP but marks it for downstream review",
      () => {
        const result =
          normalizeExternalDestination(
            "http://example.com/product",
          );

        expect(
          result.riskSignals,
        ).toEqual([
          "http_transport",
        ]);
      },
    );

    it.each([
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "ftp://example.com/file",
      "//example.com/path",
    ])(
      "rejects dangerous or ambiguous scheme input %s",
      (value) => {
        expect(() =>
          normalizeExternalDestination(
            value,
          ),
        ).toThrow();
      },
    );

    it.each([
      " https://example.com",
      "https://example.com ",
      "https://example.com/a b",
      "https://example.com\\evil",
      "https://example.com/\nanything",
    ])(
      "rejects whitespace or backslash ambiguity in %s",
      (value) => {
        expect(() =>
          normalizeExternalDestination(
            value,
          ),
        ).toThrow();
      },
    );

    it.each([
      "https://user:pass@example.com/path",
      "https://user@example.com/path",
    ])(
      "rejects credential-bearing URL %s",
      (value) => {
        expect(() =>
          normalizeExternalDestination(
            value,
          ),
        ).toThrow();
      },
    );

    it.each([
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f000001/",
      "http://[::1]/",
      "http://192.168.1.10/",
      "http://169.254.169.254/latest/meta-data/",
    ])(
      "rejects direct IP destination %s",
      (value) => {
        expect(() =>
          normalizeExternalDestination(
            value,
          ),
        ).toThrow();
      },
    );

    it.each([
      "https://localhost/",
      "https://service.local/",
      "https://api.internal/",
      "https://host.home.arpa/",
      "https://intranet/",
    ])(
      "rejects local/private hostname %s",
      (value) => {
        expect(() =>
          normalizeExternalDestination(
            value,
          ),
        ).toThrow();
      },
    );

    it.each([
      "https://example.com:8443/path",
      "http://example.com:8080/path",
      "https://example.com:22/path",
    ])(
      "rejects non-standard ports in %s",
      (value) => {
        expect(() =>
          normalizeExternalDestination(
            value,
          ),
        ).toThrow();
      },
    );

    it(
      "rejects URL fragments that can hide client-side routing from scanners",
      () => {
        expect(() =>
          normalizeExternalDestination(
            "https://example.com/#/login",
          ),
        ).toThrow();
      },
    );

    it(
      "marks punycode hostnames for explicit downstream review",
      () => {
        const result =
          normalizeExternalDestination(
            "https://xn--e1afmkfd.xn--p1ai/",
          );

        expect(
          result.riskSignals,
        ).toContain(
          "punycode_hostname",
        );
      },
    );

    it(
      "does not reorder affiliate query parameters",
      () => {
        const result =
          normalizeExternalDestination(
            "https://shop.example.com/item?b=2&a=1&signature=xyz",
          );

        expect(
          result.normalizedUrl,
        ).toBe(
          "https://shop.example.com/item?b=2&a=1&signature=xyz",
        );
      },
    );
  },
);