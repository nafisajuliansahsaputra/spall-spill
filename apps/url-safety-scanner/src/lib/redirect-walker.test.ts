import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    lookupWebRisk:
      vi.fn(),

    resolvePublicHost:
      vi.fn(),

    requestPinnedHeaders:
      vi.fn(),

    requestPinnedDocument:
      vi.fn(),

    requestPinnedInspection:
      vi.fn(),

    classifyDestinationContent:
      vi.fn(),

    extractInspectableText:
      vi.fn(),

    classifySemanticDestinationContent:
      vi.fn(),
  }));

vi.mock(
  "./web-risk",
  () => ({
    lookupWebRisk:
      mocks.lookupWebRisk,
  }),
);

vi.mock(
  "./network-safety",
  () => ({
    resolvePublicHost:
      mocks.resolvePublicHost,
  }),
);

vi.mock(
  "./pinned-transport",
  () => ({
    requestPinnedHeaders:
      mocks.requestPinnedHeaders,

    requestPinnedDocument:
      mocks.requestPinnedDocument,

    requestPinnedInspection:
      mocks.requestPinnedInspection,
  }),
);

vi.mock(
  "./content-policy",
  () => ({
    classifyDestinationContent:
      mocks.classifyDestinationContent,

    extractInspectableText:
      mocks.extractInspectableText,
  }),
);

vi.mock(
  "./semantic-classifier",
  () => ({
    classifySemanticDestinationContent:
      mocks.classifySemanticDestinationContent,
  }),
);

import {
  inspectRedirectChain,
} from "./redirect-walker";

const publicAddresses = [
  {
    address:
      "93.184.216.34",
    family:
      4 as const,
  },
];

function response(
  statusCode: number,
  location:
    string | null = null,
) {
  return {
    statusCode,
    location,
    contentType:
      "text/html",
    contentLength:
      null,
  };
}

function document(
  statusCode:
    number = 200,
) {
  return {
    statusCode,
    contentType:
      "text/html",
    byteSize:
      13,
    text:
      "ordinary page",
  };
}

const semanticApiKey =
  "test-gemini-api-key-123456";

function scan(
  normalizedUrl: string,
) {
  return inspectRedirectChain(
    normalizedUrl,
    {
      semanticApiKey,
    },
  );
}

describe(
  "URL Safety Scanner redirect walker",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.lookupWebRisk
        .mockResolvedValue({
          status:
            "clear",
          reasonCodes: [],
        });

      mocks.resolvePublicHost
        .mockResolvedValue(
          publicAddresses,
        );

      mocks.requestPinnedHeaders
        .mockResolvedValue(
          response(200),
        );

      mocks.requestPinnedDocument
        .mockResolvedValue(
          document(200),
        );

      /*
       * Compatibility adapter for the existing
       * redirect-walker unit scenarios.
       *
       * Production no longer performs these two
       * operations; the adapter only synthesizes
       * the new single-inspection result from the
       * existing test fixtures.
       */
      mocks.requestPinnedInspection
        .mockImplementation(
          async (
            normalizedUrl:
              string,
            addresses:
              typeof publicAddresses,
            timeoutMs:
              number,
          ) => {
            const headers =
              await mocks.requestPinnedHeaders(
                normalizedUrl,
                addresses,
                timeoutMs,
              );

            if (
              headers.statusCode >=
                300 &&
              headers.statusCode <=
                399
            ) {
              return {
                kind:
                  "redirect" as const,

                headers,
              };
            }

            const terminalDocument =
              await mocks.requestPinnedDocument(
                normalizedUrl,
                addresses,
                timeoutMs,
              );

            return {
              kind:
                "document" as const,

              headers,

              document:
                terminalDocument,
            };
          },
        );

      mocks.classifyDestinationContent
        .mockReturnValue({
          status:
            "clear",

          reasonCodes: [],

          extractedTextLength:
            13,
        });

      mocks.extractInspectableText
        .mockReturnValue(
          "ordinary page",
        );

      mocks.classifySemanticDestinationContent
        .mockResolvedValue({
          status:
            "clear",

          reasonCodes: [],

          provider:
            "gemini",

          model:
            "gemini-3.7-flash",
        });
    });

    it(
      "scans a terminal destination through threat, DNS, pinned headers, and bounded content inspection",
      async () => {
        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toEqual({
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
        });

        expect(
          mocks.lookupWebRisk,
        ).toHaveBeenCalledWith(
          "https://example.com/",
          {
            timeoutMs:
              expect.any(
                Number,
              ),
          },
        );

        expect(
          mocks.resolvePublicHost,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.resolvePublicHost,
        ).toHaveBeenCalledWith(
          "example.com",
          expect.any(
            Number,
          ),
        );

        expect(
          mocks.requestPinnedHeaders,
        ).toHaveBeenCalledWith(
          "https://example.com/",
          publicAddresses,
        expect.any(Number),
        );

        expect(
          mocks.requestPinnedDocument,
        ).toHaveBeenCalledWith(
          "https://example.com/",
          publicAddresses,
        expect.any(Number),
        );

        expect(
          mocks.classifyDestinationContent,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "stops before DNS and content inspection when Web Risk blocks the current hop",
      async () => {
        mocks.lookupWebRisk
          .mockResolvedValue({
            status:
              "blocked",

            reasonCodes: [
              "web_risk:malware",
            ],
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "blocked",

          checkedUrl:
            "https://example.com/",

          finalStatusCode:
            null,

          reasonCodes: [
            "web_risk:malware",
          ],
        });

        expect(
          mocks.resolvePublicHost,
        ).not.toHaveBeenCalled();

        expect(
          mocks.requestPinnedHeaders,
        ).not.toHaveBeenCalled();

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();

        expect(
          mocks.classifyDestinationContent,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "stops before network access when Web Risk requires review",
      async () => {
        mocks.lookupWebRisk
          .mockResolvedValue({
            status:
              "review",

            reasonCodes: [
              "web_risk:social_engineering_extended_coverage",
            ],
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "review",
        });

        expect(
          mocks.resolvePublicHost,
        ).not.toHaveBeenCalled();

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "re-runs every security layer after a relative redirect",
      async () => {
        mocks.requestPinnedHeaders
          .mockResolvedValueOnce(
            response(
              302,
              "/next?q=1",
            ),
          )
          .mockResolvedValueOnce(
            response(200),
          );

        const result =
          await scan(
            "https://example.com/start",
          );

        expect(
          result.status,
        ).toBe(
          "clear",
        );

        expect(
          result.checkedUrl,
        ).toBe(
          "https://example.com/next?q=1",
        );

        expect(
          mocks.lookupWebRisk,
        ).toHaveBeenNthCalledWith(
          1,
          "https://example.com/start",
          {
            timeoutMs:
              expect.any(
                Number,
              ),
          },
        );

        expect(
          mocks.lookupWebRisk,
        ).toHaveBeenNthCalledWith(
          2,
          "https://example.com/next?q=1",
          {
            timeoutMs:
              expect.any(
                Number,
              ),
          },
        );

        expect(
          mocks.resolvePublicHost,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          mocks.requestPinnedHeaders,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          mocks.requestPinnedDocument,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.requestPinnedDocument,
        ).toHaveBeenCalledWith(
          "https://example.com/next?q=1",
          publicAddresses,
        expect.any(Number),
        );
      },
    );

    it(
      "revalidates a redirect to a different hostname from zero",
      async () => {
        mocks.requestPinnedHeaders
          .mockResolvedValueOnce(
            response(
              301,
              "https://other.example/path",
            ),
          )
          .mockResolvedValueOnce(
            response(200),
          );

        await scan(
          "https://example.com/",
        );

        expect(
          mocks.resolvePublicHost,
        ).toHaveBeenNthCalledWith(
          1,
          "example.com",
          expect.any(
            Number,
          ),
        );

        expect(
          mocks.resolvePublicHost,
        ).toHaveBeenNthCalledWith(
          2,
          "other.example",
          expect.any(
            Number,
          ),
        );

        expect(
          mocks.lookupWebRisk,
        ).toHaveBeenNthCalledWith(
          2,
          "https://other.example/path",
          {
            timeoutMs:
              expect.any(
                Number,
              ),
          },
        );

        expect(
          mocks.requestPinnedDocument,
        ).toHaveBeenCalledWith(
          "https://other.example/path",
          publicAddresses,
        expect.any(Number),
        );
      },
    );

    it.each([
      "http://localhost/admin",
      "http://127.0.0.1/admin",
      "http://169.254.169.254/latest/meta-data/",
      "https://user@example.com/private",
      "https://example.com:8443/private",
      "https://example.com/#fragment",
      " https://evil.example/",
      "https:\\\\evil.example\\private",
    ])(
      "rejects unsafe redirect target before second-hop DNS or network access: %s",
      async (
        location,
      ) => {
        mocks.requestPinnedHeaders
          .mockResolvedValueOnce(
            response(
              302,
              location,
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow();

        expect(
          mocks.lookupWebRisk,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.resolvePublicHost,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.requestPinnedHeaders,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "detects redirect loops",
      async () => {
        mocks.requestPinnedHeaders
          .mockResolvedValueOnce(
            response(
              302,
              "/two",
            ),
          )
          .mockResolvedValueOnce(
            response(
              302,
              "/",
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "redirect loop",
        );

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a redirect without Location",
      async () => {
        mocks.requestPinnedHeaders
          .mockResolvedValue(
            response(
              302,
              null,
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "without a location",
        );

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects unsupported 3xx response codes instead of treating them as safe",
      async () => {
        mocks.requestPinnedHeaders
          .mockResolvedValue(
            response(
              305,
              "https://other.example/",
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow(
          "unsupported redirect status",
        );

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "enforces a maximum of five redirects",
      async () => {
        const locations = [
          "/one",
          "/two",
          "/three",
          "/four",
          "/five",
          "/six",
        ];

        mocks.requestPinnedHeaders
          .mockImplementation(
            async () => {
              const location =
                locations.shift();

              return response(
                302,
                location ??
                  "/overflow",
              );
            },
          );

        await expect(
          scan(
            "https://example.com/start",
          ),
        ).rejects.toThrow(
          "redirect limit",
        );

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed before DNS when the scan-wide deadline is exhausted",
      async () => {
        const nowSpy =
          vi.spyOn(
            Date,
            "now",
          );

        nowSpy
          .mockReturnValueOnce(
            0,
          )
          .mockReturnValueOnce(
            0,
          )
          .mockReturnValue(
            12_001,
          );

        try {
          await expect(
            scan(
              "https://example.com/",
            ),
          ).rejects.toThrow(
            "scan deadline",
          );

          expect(
            mocks.lookupWebRisk,
          ).toHaveBeenCalledTimes(
            1,
          );

          expect(
            mocks.resolvePublicHost,
          ).not.toHaveBeenCalled();

          expect(
            mocks.requestPinnedHeaders,
          ).not.toHaveBeenCalled();

          expect(
            mocks.requestPinnedDocument,
          ).not.toHaveBeenCalled();

          expect(
            mocks.classifySemanticDestinationContent,
          ).not.toHaveBeenCalled();
        } finally {
          nowSpy.mockRestore();
        }
      },
    );

    it(
      "fails closed when threat intelligence fails",
      async () => {
        mocks.lookupWebRisk
          .mockRejectedValue(
            new Error(
              "provider unavailable",
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow();

        expect(
          mocks.resolvePublicHost,
        ).not.toHaveBeenCalled();

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when DNS resolution fails",
      async () => {
        mocks.resolvePublicHost
          .mockRejectedValue(
            new Error(
              "unsafe DNS",
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow();

        expect(
          mocks.requestPinnedHeaders,
        ).not.toHaveBeenCalled();

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when pinned header transport fails",
      async () => {
        mocks.requestPinnedHeaders
          .mockRejectedValue(
            new Error(
              "connection failed",
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow();

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when bounded terminal document inspection fails",
      async () => {
        mocks.requestPinnedDocument
          .mockRejectedValue(
            new Error(
              "document inspection failed",
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow();

        expect(
          mocks.classifyDestinationContent,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "consumes terminal status and body from one pinned inspection result",
      async () => {
        mocks.requestPinnedInspection
          .mockResolvedValue({
            kind:
              "document",

            headers:
              response(
                200,
              ),

            document:
              document(
                200,
              ),
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "clear",

          finalStatusCode:
            200,
        });

        expect(
          mocks.requestPinnedInspection,
        ).toHaveBeenCalledTimes(
          1,
        );

        /*
         * Overriding the compatibility adapter
         * proves the walker itself does not call
         * either legacy two-phase transport API.
         */
        expect(
          mocks.requestPinnedHeaders,
        ).not.toHaveBeenCalled();

        expect(
          mocks.requestPinnedDocument,
        ).not.toHaveBeenCalled();
      },
    );
    it.each([
      404,
      500,
    ])(
      "never treats terminal non-2xx status %s as clear",
      async (
        statusCode,
      ) => {
        mocks.requestPinnedHeaders
          .mockResolvedValue(
            response(
              statusCode,
            ),
          );

        mocks.requestPinnedDocument
          .mockResolvedValue(
            document(
              statusCode,
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "review",

          finalStatusCode:
            statusCode,

          reasonCodes: [
            "destination:non_success_status",
          ],
        });
      },
    );

    it(
      "hard-blocks when bounded visible content is explicitly prohibited",
      async () => {
        mocks.classifyDestinationContent
          .mockReturnValue({
            status:
              "blocked",

            reasonCodes: [
              "content:gambling",
            ],

            extractedTextLength:
              20,
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:gambling",
          ],
        });
      },
    );

    it(
      "routes ambiguous content signals to review",
      async () => {
        mocks.classifyDestinationContent
          .mockReturnValue({
            status:
              "review",

            reasonCodes: [
              "content:scam_signal",
            ],

            extractedTextLength:
              20,
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "review",

          reasonCodes: [
            "content:scam_signal",
          ],
        });
      },
    );

    it(
      "hard-blocks when semantic provider confidently identifies prohibited content",
      async () => {
        mocks.classifySemanticDestinationContent
          .mockResolvedValue({
            status:
              "blocked",

            reasonCodes: [
              "semantic:scam_explicit",
            ],

            provider:
              "gemini",

            model:
              "gemini-3.7-flash",
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "semantic:scam_explicit",
          ],
        });
      },
    );

    it(
      "routes semantic uncertainty to review",
      async () => {
        mocks.classifySemanticDestinationContent
          .mockResolvedValue({
            status:
              "review",

            reasonCodes: [
              "semantic:adult_ambiguous",
            ],

            provider:
              "gemini",

            model:
              "gemini-3.7-flash",
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "review",

          reasonCodes: [
            "semantic:adult_ambiguous",
          ],
        });
      },
    );

    it(
      "fails closed when semantic provider cannot complete classification",
      async () => {
        mocks.classifySemanticDestinationContent
          .mockRejectedValue(
            new Error(
              "semantic provider unavailable",
            ),
          );

        await expect(
          scan(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "never calls semantic provider when deterministic content policy already blocks",
      async () => {
        mocks.classifyDestinationContent
          .mockReturnValue({
            status:
              "blocked",

            reasonCodes: [
              "content:gambling",
            ],

            extractedTextLength:
              20,
          });

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "blocked",
        });

        expect(
          mocks.classifySemanticDestinationContent,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "routes a page with no visible classifiable text to review without trusting it",
      async () => {
        mocks.extractInspectableText
          .mockReturnValue("");

        await expect(
          scan(
            "https://example.com/",
          ),
        ).resolves.toMatchObject({
          status:
            "review",

          reasonCodes: [
            "content:no_visible_text",
          ],
        });

        expect(
          mocks.classifySemanticDestinationContent,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "promotes HTTP transport risk from clear content to review",
      async () => {
        mocks.requestPinnedHeaders
          .mockResolvedValueOnce(
            response(
              302,
              "http://other.example/path",
            ),
          )
          .mockResolvedValueOnce(
            response(200),
          );

        const result =
          await scan(
            "https://example.com/",
          );

        expect(
          result.status,
        ).toBe(
          "review",
        );

        expect(
          result.riskSignals,
        ).toContain(
          "http_transport",
        );

        expect(
          result.reasonCodes,
        ).toContain(
          "destination:http_transport",
        );
      },
    );

    it(
      "promotes a punycode hostname risk from clear content to review",
      async () => {
        const result =
          await scan(
            "https://xn--bcher-kva.example/",
          );

        expect(
          result.status,
        ).toBe(
          "review",
        );

        expect(
          result.riskSignals,
        ).toContain(
          "punycode_hostname",
        );

        expect(
          result.reasonCodes,
        ).toContain(
          "destination:punycode_hostname",
        );
      },
    );
  },
);