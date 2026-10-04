import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createPinnedRequestOptions,
  requestPinnedHeaders,
} from "./pinned-transport";

describe(
  "URL Safety Scanner pinned transport",
  () => {
    it(
      "keeps the original HTTPS hostname while pinning lookup to the validated address",
      () => {
        const options =
          createPinnedRequestOptions(
            "https://example.com/path?q=1",
            {
              address:
                "93.184.216.34",
              family: 4,
            },
          );

        expect(
          options.hostname,
        ).toBe(
          "example.com",
        );

        expect(
          options.servername,
        ).toBe(
          "example.com",
        );

        expect(
          options.port,
        ).toBe(443);

        expect(
          options.path,
        ).toBe(
          "/path?q=1",
        );

        expect(
          options.agent,
        ).toBe(false);

        expect(
          options.rejectUnauthorized,
        ).toBe(true);
      },
    );

    it(
      "returns only the exact prevalidated IPv4 address from the custom lookup",
      async () => {
        const options =
          createPinnedRequestOptions(
            "https://example.com/",
            {
              address:
                "93.184.216.34",
              family: 4,
            },
          );

        const lookup =
          options.lookup;

        expect(
          lookup,
        ).toBeTypeOf(
          "function",
        );

        const result =
          await new Promise<{
            address:
              string;
            family:
              number;
          }>(
            (
              resolve,
              reject,
            ) => {
              lookup!(
                "attacker-controlled-value-is-ignored",
                {},
                (
                  error,
                  address,
                  family,
                ) => {
                  if (error) {
                    reject(error);

                    return;
                  }

                  if (
                    typeof address !==
                      "string"
                  ) {
                    reject(
                      new Error(
                        "Expected one pinned address.",
                      ),
                    );

                    return;
                  }

                  resolve({
                    address,
                    family:
                      Number(
                        family,
                      ),
                  });
                },
              );
            },
          );

        expect(result)
          .toEqual({
            address:
              "93.184.216.34",
            family: 4,
          });
      },
    );

    it(
      "pins IPv6 without replacing the original TLS hostname",
      async () => {
        const options =
          createPinnedRequestOptions(
            "https://example.com/",
            {
              address:
                "2606:4700:4700::1111",
              family: 6,
            },
          );

        expect(
          options.hostname,
        ).toBe(
          "example.com",
        );

        expect(
          options.servername,
        ).toBe(
          "example.com",
        );

        const result =
          await new Promise<{
            address:
              string;
            family:
              number;
          }>(
            (
              resolve,
              reject,
            ) => {
              options.lookup!(
                "example.com",
                {},
                (
                  error,
                  address,
                  family,
                ) => {
                  if (error) {
                    reject(error);

                    return;
                  }

                  if (
                    typeof address !==
                      "string"
                  ) {
                    reject(
                      new Error(
                        "Expected one pinned address.",
                      ),
                    );

                    return;
                  }

                  resolve({
                    address,
                    family:
                      Number(
                        family,
                      ),
                  });
                },
              );
            },
          );

        expect(result)
          .toEqual({
            address:
              "2606:4700:4700::1111",
            family: 6,
          });
      },
    );

    it(
      "uses standard HTTP semantics without TLS authority",
      () => {
        const options =
          createPinnedRequestOptions(
            "http://example.com/product",
            {
              address:
                "93.184.216.34",
              family: 4,
            },
          );

        expect(
          options.protocol,
        ).toBe(
          "http:",
        );

        expect(
          options.port,
        ).toBe(80);

        expect(
          options.servername,
        ).toBeUndefined();

        expect(
          options.rejectUnauthorized,
        ).toBeUndefined();
      },
    );

    it.each([
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
    ])(
      "refuses a private or metadata pinned IPv4 address: %s",
      (address) => {
        expect(
          () =>
            createPinnedRequestOptions(
              "https://example.com/",
              {
                address,
                family: 4,
              },
            ),
        ).toThrow(
          "public network address",
        );
      },
    );

    it.each([
      "::1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
    ])(
      "refuses a non-public pinned IPv6 address: %s",
      (address) => {
        expect(
          () =>
            createPinnedRequestOptions(
              "https://example.com/",
              {
                address,
                family: 6,
              },
            ),
        ).toThrow(
          "public network address",
        );
      },
    );

    it(
      "rejects non-canonical destinations",
      () => {
        expect(
          () =>
            createPinnedRequestOptions(
              "https://EXAMPLE.com",
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ),
        ).toThrow(
          "exact canonical destination",
        );
      },
    );

    it(
      "rejects direct-IP destinations even when the supplied pin is public",
      () => {
        expect(
          () =>
            createPinnedRequestOptions(
              "https://8.8.8.8/",
              {
                address:
                  "8.8.8.8",
                family: 4,
              },
            ),
        ).toThrow();
      },
    );

    it(
      "does not allow an empty validated address set",
      async () => {
        await expect(
          requestPinnedHeaders(
            "https://example.com/",
            [],
          ),
        ).rejects.toThrow(
          "at least one validated address",
        );
      },
    );

    it(
      "uses connection-close semantics instead of a pooled socket",
      () => {
        const options =
          createPinnedRequestOptions(
            "https://example.com/",
            {
              address:
                "93.184.216.34",
              family: 4,
            },
          );

        expect(
          options.agent,
        ).toBe(false);

        expect(
          options.headers,
        ).toMatchObject({
          Connection:
            "close",
          Host:
            "example.com",
        });
      },
    );

    it(
      "caps headers and transport duration",
      () => {
        const options =
          createPinnedRequestOptions(
            "https://example.com/",
            {
              address:
                "93.184.216.34",
              family: 4,
            },
          );

        expect(
          options.maxHeaderSize,
        ).toBe(
          16 * 1024,
        );

        expect(
          options.timeout,
        ).toBe(
          5_000,
        );
      },
    );
  },
);