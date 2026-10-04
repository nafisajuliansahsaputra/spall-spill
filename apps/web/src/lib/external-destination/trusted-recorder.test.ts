import {
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

const mocks =
  vi.hoisted(() => ({
    scanExternalDestination:
      vi.fn(),

    createSupabaseServiceClient:
      vi.fn(),

    schema:
      vi.fn(),

    rpc:
      vi.fn(),
  }));

vi.mock(
  "./scanner-client",
  () => ({
    scanExternalDestination:
      mocks.scanExternalDestination,
  }),
);

vi.mock(
  "@/lib/supabase/service",
  () => ({
    createSupabaseServiceClient:
      mocks.createSupabaseServiceClient,
  }),
);

import {
  scanAndRecordPendingExternalDestination,
} from "./trusted-recorder";

const pending = {
  normalizedUrl:
    "https://example.com/",

  hostname:
    "example.com",

  riskSignals: [],

  urlHash:
    "a".repeat(
      64,
    ),

  requiresScan:
    true,

  revision:
    7,
} as const;

function scannerVerdict(
  overrides:
    Record<string, unknown> = {},
) {
  return {
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

function writerResponse(
  overrides:
    Record<string, unknown> = {},
) {
  return {
    status:
      "success",

    url_hash:
      pending.urlHash,

    safety_status:
      "safe",

    reason_codes: [],

    checked_at:
      "2026-09-02T07:30:00.000Z",

    expires_at:
      "2026-09-02T08:30:00.000Z",

    revision:
      8,

    ...overrides,
  };
}

describe(
  "trusted external destination safety recorder",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.createSupabaseServiceClient
        .mockReturnValue({
          schema:
            mocks.schema,
        });

      mocks.schema
        .mockReturnValue({
          rpc:
            mocks.rpc,
        });

      mocks.scanExternalDestination
        .mockResolvedValue(
          scannerVerdict(),
        );

      mocks.rpc
        .mockResolvedValue({
          data:
            writerResponse(),

          error:
            null,
        });
    });

    it(
      "promotes only a clean 2xx scanner verdict to DB safe through the bound writer",
      async () => {
        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).resolves.toMatchObject({
          safetyStatus:
            "safe",

          urlHash:
            pending.urlHash,

          revision:
            8,
        });

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "record_external_destination_safety_bound_server",
          {
            input_normalized_url:
              "https://example.com/",

            input_expected_url_hash:
              pending.urlHash,

            input_expected_revision:
              7,

            input_safety_status:
              "safe",

            input_reason_codes: [],

            input_scanner_version:
              "spall-url-safety-v1",

            input_ttl_seconds:
              3600,
          },
        );
      },
    );

    it(
      "records scanner review without promoting it to safe",
      async () => {
        mocks.scanExternalDestination
          .mockResolvedValue(
            scannerVerdict({
              status:
                "review",

              reasonCodes: [
                "content:scam_signal",
              ],
            }),
          );

        mocks.rpc
          .mockResolvedValue({
            data:
              writerResponse({
                safety_status:
                  "review",

                reason_codes: [
                  "content:scam_signal",
                ],
              }),

            error:
              null,
          });

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).resolves.toMatchObject({
          safetyStatus:
            "review",
        });

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "record_external_destination_safety_bound_server",
          expect.objectContaining({
            input_safety_status:
              "review",

            input_ttl_seconds:
              3600,
          }),
        );
      },
    );

    it(
      "records scanner blocked verdict with the longer blocked TTL",
      async () => {
        mocks.scanExternalDestination
          .mockResolvedValue(
            scannerVerdict({
              status:
                "blocked",

              finalStatusCode:
                null,

              hops: [],

              reasonCodes: [
                "web_risk:malware",
              ],
            }),
          );

        mocks.rpc
          .mockResolvedValue({
            data:
              writerResponse({
                safety_status:
                  "blocked",

                reason_codes: [
                  "web_risk:malware",
                ],

                expires_at:
                  "2026-09-03T07:30:00.000Z",
              }),

            error:
              null,
          });

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).resolves.toMatchObject({
          safetyStatus:
            "blocked",
        });

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "record_external_destination_safety_bound_server",
          expect.objectContaining({
            input_safety_status:
              "blocked",

            input_ttl_seconds:
              86400,
          }),
        );
      },
    );

    it.each([
      404,
      500,
    ])(
      "never persists scanner clear with terminal status %s as safe",
      async (
        statusCode,
      ) => {
        mocks.scanExternalDestination
          .mockResolvedValue(
            scannerVerdict({
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
          );

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).rejects.toThrow();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "never persists clear when scanner still reports risk signals",
      async () => {
        mocks.scanExternalDestination
          .mockResolvedValue(
            scannerVerdict({
              riskSignals: [
                "punycode_hostname",
              ],
            }),
          );

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).rejects.toThrow();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "leaves destination pending when scanner fails",
      async () => {
        mocks.scanExternalDestination
          .mockRejectedValue(
            new Error(
              "scanner unavailable",
            ),
          );

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).rejects.toThrow();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects unexplained non-safe verdicts before database authority",
      async () => {
        mocks.scanExternalDestination
          .mockResolvedValue(
            scannerVerdict({
              status:
                "review",

              reasonCodes: [],
            }),
          );

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).rejects.toThrow();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when bound writer rejects a stale scanner result",
      async () => {
        mocks.rpc
          .mockResolvedValue({
            data: {
              status:
                "stale_revision",
            },

            error:
              null,
          });

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects a successful writer response with mismatched URL identity",
      async () => {
        mocks.rpc
          .mockResolvedValue({
            data:
              writerResponse({
                url_hash:
                  "b".repeat(
                    64,
                  ),
              }),

            error:
              null,
          });

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects an unexpected post-write revision",
      async () => {
        mocks.rpc
          .mockResolvedValue({
            data:
              writerResponse({
                revision:
                  10,
              }),

            error:
              null,
          });

        await expect(
          scanAndRecordPendingExternalDestination(
            pending,
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "refuses to scan a registration that does not require scanning",
      async () => {
        await expect(
          scanAndRecordPendingExternalDestination({
            ...pending,

            requiresScan:
              false,
          }),
        ).rejects.toThrow();

        expect(
          mocks.scanExternalDestination,
        ).not.toHaveBeenCalled();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );
  },
);