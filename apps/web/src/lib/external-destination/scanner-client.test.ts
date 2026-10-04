import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "server-only",
  () => ({}),
);

import {
  scanExternalDestination,
} from "./scanner-client";

const secret =
  "test-scanner-secret-12345678901234567890";

function scannerResponse(
  overrides:
    Record<string, unknown> = {},
) {
  return {
    layer:
      "destination_network",

    status:
      "clear",

    checkedUrl:
      "https://example.com/",

    finalStatusCode:
      200,

    hops: [
      {
        url:
          "https://example.com/",

        statusCode:
          200,
      },
    ],

    reasonCodes: [],

    riskSignals: [],

    ...overrides,
  };
}

function scannerHttpResponse(
  body:
    BodyInit | null,
  init:
    ResponseInit = {},
): Response {
  const headers =
    new Headers(
      init.headers,
    );

  /*
   * A successful scanner response is JSON by
   * contract. Individual tests may explicitly
   * override this header when testing rejection
   * of an invalid media type.
   */
  if (
    !headers.has(
      "content-type",
    )
  ) {
    headers.set(
      "content-type",
      "application/json",
    );
  }

  return new Response(
    body,
    {
      ...init,
      headers,
    },
  );
}

describe(
  "external destination scanner client",
  () => {
    beforeEach(() => {
      process.env
        .URL_SAFETY_SCANNER_ORIGIN =
          "https://scanner.example.test";

      process.env
        .URL_SAFETY_SCANNER_SHARED_SECRET =
          secret;
    });

    afterEach(() => {
      vi.restoreAllMocks();

      delete process.env
        .URL_SAFETY_SCANNER_ORIGIN;

      delete process.env
        .URL_SAFETY_SCANNER_SHARED_SECRET;
    });

    it(
      "signs the exact request body and accepts a bound terminal verdict",
      async () => {
        vi.spyOn(
          Date,
          "now",
        ).mockReturnValue(
          1_780_000_000_000,
        );

        const fetchMock =
          vi.spyOn(
            globalThis,
            "fetch",
          ).mockResolvedValue(
            scannerHttpResponse(
              JSON.stringify(
                scannerResponse(),
              ),
              {
                status:
                  200,

                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "clear",

          checkedUrl:
            "https://example.com/",
        });

        const call =
          fetchMock.mock
            .calls[0];

        expect(
          String(
            call?.[0],
          ),
        ).toBe(
          "https://scanner.example.test/api/scan",
        );

        const options =
          call?.[1];

        expect(
          options?.body,
        ).toBe(
          '{"normalizedUrl":"https://example.com/"}',
        );

        const headers =
          options?.headers as
            Record<
              string,
              string
            >;

        expect(
          headers[
            "x-spall-timestamp"
          ],
        ).toBe(
          "1780000000000",
        );

        expect(
          headers[
            "x-spall-signature"
          ],
        ).toMatch(
          /^[0-9a-f]{64}$/,
        );

        expect(
          options?.redirect,
        ).toBe(
          "error",
        );
      },
    );

    it(
      "rejects a successful scanner response with a non-JSON media type",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse(),
            ),
            {
              status:
                200,

              headers: {
                "content-type":
                  "text/plain",
              },
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "unexpected content type",
        );
      },
    );

    it(
      "stops consuming and rejects a streamed scanner response once the byte cap is exceeded",
      async () => {
        let cancelled =
          false;

        const stream =
          new ReadableStream<
            Uint8Array
          >({
            start(
              controller,
            ) {
              controller.enqueue(
                new Uint8Array(
                  32 * 1024,
                ),
              );

              controller.enqueue(
                new Uint8Array([
                  0x7b,
                ]),
              );
            },

            cancel() {
              cancelled =
                true;
            },
          });

        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            stream,
            {
              status:
                200,

              headers: {
                "content-type":
                  "application/json",
              },
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "exceeded the allowed size",
        );

        expect(
          cancelled,
        ).toBe(true);
      },
    );

    it(
      "accepts a redirect chain only when it begins with the requested URL and ends at checkedUrl",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                checkedUrl:
                  "https://www.example.com/final",

                finalStatusCode:
                  200,

                hops: [
                  {
                    url:
                      "https://example.com/",

                    statusCode:
                      301,
                  },
                  {
                    url:
                      "https://www.example.com/final",

                    statusCode:
                      200,
                  },
                ],
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          checkedUrl:
            "https://www.example.com/final",
        });
      },
    );

    it(
      "rejects a response whose first hop is not the requested URL",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                hops: [
                  {
                    url:
                      "https://other.example/",

                    statusCode:
                      200,
                  },
                ],

                checkedUrl:
                  "https://other.example/",
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects a response whose checkedUrl is not the final hop",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                checkedUrl:
                  "https://wrong.example/",
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "accepts a pre-network blocked verdict only when it remains bound to the requested URL",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                status:
                  "blocked",

                checkedUrl:
                  "https://example.com/",

                finalStatusCode:
                  null,

                hops: [],

                reasonCodes: [
                  "web_risk:malware",
                ],
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "blocked",

          finalStatusCode:
            null,
        });
      },
    );

    it(
      "rejects a clear verdict that has no inspected HTTP hop",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                status:
                  "clear",

                checkedUrl:
                  "https://example.com/",

                finalStatusCode:
                  null,

                hops: [],

                reasonCodes: [],

                riskSignals: [],
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "inconsistent clear verdict",
        );
      },
    );

    it.each([
      404,
      500,
    ])(
      "rejects clear verdict with non-2xx terminal status %s",
      async (
        statusCode,
      ) => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                status:
                  "clear",

                finalStatusCode:
                  statusCode,

                hops: [
                  {
                    url:
                      "https://example.com/",

                    statusCode,
                  },
                ],
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "inconsistent clear verdict",
        );
      },
    );

    it(
      "rejects clear verdict that carries a reason code",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                status:
                  "clear",

                reasonCodes: [
                  "content:unexpected",
                ],
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "inconsistent clear verdict",
        );
      },
    );

    it(
      "rejects clear verdict that carries a structural risk signal",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                status:
                  "clear",

                riskSignals: [
                  "punycode_hostname",
                ],
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "inconsistent clear verdict",
        );
      },
    );

    it.each([
      "review",
      "blocked",
    ] as const)(
      "rejects unexplained %s verdict",
      async (
        status,
      ) => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify(
              scannerResponse({
                status,

                reasonCodes: [],
              }),
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "unexplained non-safe verdict",
        );
      },
    );

    it(
      "rejects unknown response fields",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            JSON.stringify({
              ...scannerResponse(),

              unexpected:
                true,
            }),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "fails closed on scanner non-success status",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            null,
            {
              status:
                503,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "fails closed on malformed JSON",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            "{broken",
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "fails closed on oversized response bodies",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          scannerHttpResponse(
            "x".repeat(
              33 * 1024,
            ),
            {
              status:
                200,
            },
          ),
        );

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects insecure non-loopback scanner origins",
      async () => {
        process.env
          .URL_SAFETY_SCANNER_ORIGIN =
            "http://scanner.example.test";

        await expect(
          scanExternalDestination(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "requires HTTPS",
        );
      },
    );
  },
);