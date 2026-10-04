import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(
  () => ({
    rpc:
      vi.fn(),

    schema:
      vi.fn(),
  }),
);

vi.mock(
  "@/lib/supabase/service",
  () => ({
    createSupabaseServiceClient:
      () => ({
        schema:
          mocks.schema,
      }),
  }),
);

import {
  ensureExternalDestinationPending,
} from "./safety";

describe(
  "External Destination safety registration",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.schema
        .mockReturnValue({
          rpc:
            mocks.rpc,
        });

      mocks.rpc
        .mockResolvedValue({
          data: {
            status:
              "success",

            url_hash:
              "a".repeat(64),

            safety_status:
              "pending",

            requires_scan:
              true,

            revision:
              1,
          },

          error:
            null,
        });
    });

    it(
      "normalizes before calling the exact service-only RPC",
      async () => {
        const result =
          await ensureExternalDestinationPending(
            "https://Example.COM/item?b=2&a=1",
          );

        expect(
          result.normalizedUrl,
        ).toBe(
          "https://example.com/item?b=2&a=1",
        );

        expect(
          mocks.schema,
        ).toHaveBeenCalledWith(
          "api",
        );

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "ensure_external_destination_pending_server",
          {
            input_normalized_url:
              "https://example.com/item?b=2&a=1",

            input_risk_signals:
              [],
          },
        );
      },
    );

    it(
      "passes policy risk signals to the safety database",
      async () => {
        await ensureExternalDestinationPending(
          "http://xn--e1afmkfd.xn--p1ai/",
        );

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "ensure_external_destination_pending_server",
          {
            input_normalized_url:
              "http://xn--e1afmkfd.xn--p1ai/",

            input_risk_signals: [
              "http_transport",
              "punycode_hostname",
            ],
          },
        );
      },
    );

    it.each([
      "javascript:alert(1)",
      "https://localhost/test",
      "https://127.0.0.1/test",
      "https://user@example.com/test",
      "https://example.com:8443/test",
    ])(
      "rejects unsafe input before privileged RPC: %s",
      async (url) => {
        await expect(
          ensureExternalDestinationPending(
            url,
          ),
        ).rejects.toThrow();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when service RPC fails",
      async () => {
        mocks.rpc
          .mockResolvedValue({
            data: null,

            error: {
              message:
                "simulated",
            },
          });

        await expect(
          ensureExternalDestinationPending(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects malformed privileged responses",
      async () => {
        mocks.rpc
          .mockResolvedValue({
            data: {
              status:
                "success",

              url_hash:
                "not-a-hash",

              safety_status:
                "safe",

              requires_scan:
                false,

              revision:
                1,
            },

            error: null,
          });

        await expect(
          ensureExternalDestinationPending(
            "https://example.com/",
          ),
        ).rejects.toThrow();
      },
    );
  },
);