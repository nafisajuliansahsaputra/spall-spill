import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    inspectRedirectChain:
      vi.fn(),
  }));

vi.mock(
  "../../../lib/redirect-walker",
  () => ({
    inspectRedirectChain:
      mocks.inspectRedirectChain,
  }),
);

import {
  createScannerSignature,
} from "../../../lib/request-auth";

import {
  POST,
} from "./route";

const secret =
  "s".repeat(48);

function createRequest(
  body: string,
  options: Readonly<{
    authenticated?: boolean;
    contentLength?: string;
  }> = {},
): Request {
  const timestamp =
    String(Date.now());

  const signature =
    createScannerSignature({
      secret,
      timestamp,
      body,
    });

  const headers =
    new Headers({
      "content-type":
        "application/json",

      "x-spall-timestamp":
        timestamp,

      "x-spall-signature":
        options.authenticated === false
          ? "0".repeat(64)
          : signature,
    });

  if (
    options.contentLength
  ) {
    headers.set(
      "content-length",
      options.contentLength,
    );
  }

  return new Request(
    "http://localhost/api/scan",
    {
      method:
        "POST",
      headers,
      body,
    },
  );
}

describe(
  "URL Safety Scanner API",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      process.env
        .URL_SAFETY_SCANNER_SHARED_SECRET =
          secret;

      process.env
        .GOOGLE_WEB_RISK_API_KEY =
          "test-google-api-key-123456";

      process.env
        .GEMINI_API_KEY =
          "test-gemini-api-key-123456";

      mocks.inspectRedirectChain
        .mockResolvedValue({
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
    });

    it(
      "rejects unauthenticated requests before scanning",
      async () => {
        const response =
          await POST(
            createRequest(
              JSON.stringify({
                normalizedUrl:
                  "https://example.com/",
              }),
              {
                authenticated:
                  false,
              },
            ),
          );

        expect(
          response.status,
        ).toBe(401);

        expect(
          mocks.inspectRedirectChain,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects oversized declared bodies",
      async () => {
        const response =
          await POST(
            createRequest(
              "{}",
              {
                contentLength:
                  String(
                    8 * 1024 + 1,
                  ),
              },
            ),
          );

        expect(
          response.status,
        ).toBe(413);

        expect(
          mocks.inspectRedirectChain,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects malformed JSON after authentication",
      async () => {
        const response =
          await POST(
            createRequest(
              "{broken",
            ),
          );

        expect(
          response.status,
        ).toBe(400);

        expect(
          mocks.inspectRedirectChain,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects non-canonical destinations",
      async () => {
        const response =
          await POST(
            createRequest(
              JSON.stringify({
                normalizedUrl:
                  "https://EXAMPLE.com",
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(400);

        expect(
          mocks.inspectRedirectChain,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      "https://localhost/",
      "https://127.0.0.1/",
      "https://user@example.com/",
      "https://example.com:8443/",
      "https://example.com/#fragment",
    ])(
      "rejects structurally unsafe destination before scanner access: %s",
      async (
        normalizedUrl,
      ) => {
        const response =
          await POST(
            createRequest(
              JSON.stringify({
                normalizedUrl,
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(400);

        expect(
          mocks.inspectRedirectChain,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects unexpected payload authority",
      async () => {
        const response =
          await POST(
            createRequest(
              JSON.stringify({
                normalizedUrl:
                  "https://example.com/",
                ownerId:
                  "attacker-controlled",
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(400);

        expect(
          mocks.inspectRedirectChain,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns only the aggregate threat and network inspection result",
      async () => {
        mocks.inspectRedirectChain
          .mockResolvedValue({
            status:
              "review",

            checkedUrl:
              "https://redirected.example/final",

            finalStatusCode:
              null,

            hops: [
              {
                url:
                  "https://example.com/",
                statusCode:
                  302,
              },
            ],

            reasonCodes: [
              "web_risk:social_engineering_extended_coverage",
            ],

            riskSignals: [
              "http_transport",
            ],
          });

        const response =
          await POST(
            createRequest(
              JSON.stringify({
                normalizedUrl:
                  "https://example.com/",
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(200);

        expect(
          await response.json(),
        ).toEqual({
          layer:
            "destination_network",

          status:
            "review",

          checkedUrl:
            "https://redirected.example/final",

          finalStatusCode:
            null,

          hops: [
            {
              url:
                "https://example.com/",
              statusCode:
                302,
            },
          ],

          reasonCodes: [
            "web_risk:social_engineering_extended_coverage",
          ],

          riskSignals: [
            "http_transport",
          ],
        });

        expect(
          mocks.inspectRedirectChain,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.inspectRedirectChain,
        ).toHaveBeenCalledWith(
          "https://example.com/",
          {
            semanticApiKey:
              "test-gemini-api-key-123456",
          },
        );
      },
    );

    it(
      "fails closed when any threat, DNS, redirect, or transport inspection fails",
      async () => {
        mocks.inspectRedirectChain
          .mockRejectedValue(
            new Error(
              "inspection unavailable",
            ),
          );

        const response =
          await POST(
            createRequest(
              JSON.stringify({
                normalizedUrl:
                  "https://example.com/",
              }),
            ),
          );

        expect(
          response.status,
        ).toBe(503);

        expect(
          response.body,
        ).toBeNull();

        expect(
          mocks.inspectRedirectChain,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);