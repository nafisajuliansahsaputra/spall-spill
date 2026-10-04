import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  lookupWebRisk,
} from "./web-risk";

describe(
  "Google Web Risk lookup",
  () => {
    beforeEach(() => {
      process.env
        .GOOGLE_WEB_RISK_API_KEY =
          "test-api-key";
    });

    afterEach(() => {
      vi.restoreAllMocks();

      delete process.env
        .GOOGLE_WEB_RISK_API_KEY;
    });

    it(
      "treats an empty Web Risk response as threat-intelligence clear only",
      async () => {
        const fetchMock =
          vi.spyOn(
            globalThis,
            "fetch",
          );

        fetchMock
          .mockResolvedValue(
            new Response(
              JSON.stringify({}),
              {
                status: 200,
                headers: {
                  "content-type":
                    "application/json",
                },
              },
            ),
          );

        await expect(
          lookupWebRisk(
            "https://example.com/",
          ),
        ).resolves.toEqual({
          status:
            "clear",
          reasonCodes: [],
        });

        const requestUrl =
          new URL(
            String(
              fetchMock.mock
                .calls[0]?.[0],
            ),
          );

        expect(
          requestUrl.origin,
        ).toBe(
          "https://webrisk.googleapis.com",
        );

        expect(
          requestUrl.pathname,
        ).toBe(
          "/v1/uris:search",
        );

        expect(
          requestUrl.searchParams
            .get("uri"),
        ).toBe(
          "https://example.com/",
        );

        expect(
          requestUrl.searchParams
            .getAll(
              "threatTypes",
            ),
        ).toEqual([
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE",
          "SOCIAL_ENGINEERING_EXTENDED_COVERAGE",
        ]);
      },
    );

    it.each([
      [
        "MALWARE",
        "web_risk:malware",
      ],
      [
        "SOCIAL_ENGINEERING",
        "web_risk:social_engineering",
      ],
      [
        "UNWANTED_SOFTWARE",
        "web_risk:unwanted_software",
      ],
    ])(
      "blocks authoritative threat %s",
      async (
        threatType,
        reasonCode,
      ) => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          new Response(
            JSON.stringify({
              threat: {
                threatTypes: [
                  threatType,
                ],
              },
            }),
            {
              status: 200,
            },
          ),
        );

        await expect(
          lookupWebRisk(
            "https://example.com/",
          ),
        ).resolves.toEqual({
          status:
            "blocked",
          reasonCodes: [
            reasonCode,
          ],
        });
      },
    );

    it(
      "sends Extended Coverage to review instead of silently trusting or hard-blocking it",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          new Response(
            JSON.stringify({
              threat: {
                threatTypes: [
                  "SOCIAL_ENGINEERING_EXTENDED_COVERAGE",
                ],
              },
            }),
            {
              status: 200,
            },
          ),
        );

        await expect(
          lookupWebRisk(
            "https://example.com/",
          ),
        ).resolves.toEqual({
          status:
            "review",
          reasonCodes: [
            "web_risk:social_engineering_extended_coverage",
          ],
        });
      },
    );

    it(
      "hard-blocks when hard and Extended Coverage threats appear together",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          new Response(
            JSON.stringify({
              threat: {
                threatTypes: [
                  "SOCIAL_ENGINEERING_EXTENDED_COVERAGE",
                  "MALWARE",
                ],
              },
            }),
            {
              status: 200,
            },
          ),
        );

        await expect(
          lookupWebRisk(
            "https://example.com/",
          ),
        ).resolves.toEqual({
          status:
            "blocked",
          reasonCodes: [
            "web_risk:malware",
          ],
        });
      },
    );

    it(
      "fails closed on provider errors",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          new Response(
            "{}",
            {
              status: 503,
            },
          ),
        );

        await expect(
          lookupWebRisk(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "fails closed on unknown provider threat types",
      async () => {
        vi.spyOn(
          globalThis,
          "fetch",
        ).mockResolvedValue(
          new Response(
            JSON.stringify({
              threat: {
                threatTypes: [
                  "UNKNOWN_THREAT",
                ],
              },
            }),
            {
              status: 200,
            },
          ),
        );

        await expect(
          lookupWebRisk(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );
  },
);