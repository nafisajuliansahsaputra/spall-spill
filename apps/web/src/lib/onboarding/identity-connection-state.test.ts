import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  schema: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock(
  "@/lib/supabase/server",
  () => ({
    createClient:
      mocks.createClient,
  }),
);

import {
  resolveCurrentIdentityConnectionState,
} from "./state";

describe(
  "resolveCurrentIdentityConnectionState",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getClaims.mockResolvedValue({
        data: {
          claims: {
            sub:
              "71000000-0000-4000-8000-000000000001",
          },
        },
        error: null,
      });

      mocks.schema.mockReturnValue({
        rpc: mocks.rpc,
      });

      mocks.createClient.mockResolvedValue({
        auth: {
          getClaims:
            mocks.getClaims,
        },
        schema:
          mocks.schema,
      });

      mocks.rpc.mockResolvedValue({
        data: {
          status: "success",
          current_step:
            "relevant_first_job",
          connection_working: {
            connection_kind:
              "social",
            social_platform:
              "instagram",
            destination_url:
              "https://instagram.com/natsx",
            revision: 2,
          },
        },
        error: null,
      });
    });

    it(
      "returns validated current-Owner Identity Connection Working",
      async () => {
        const result =
          await resolveCurrentIdentityConnectionState();

        expect(result).toEqual({
          status: "success",
          currentStep:
            "relevant_first_job",
          connectionWorking: {
            connectionKind:
              "social",
            socialPlatform:
              "instagram",
            destinationUrl:
              "https://instagram.com/natsx",
            revision: 2,
          },
        });

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "resolve_current_identity_connection_state",
        );
      },
    );

    it(
      "preserves the explicit no-Connection-Working boundary",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            current_step:
              "relevant_first_job",
            connection_working: null,
          },
          error: null,
        });

        const result =
          await resolveCurrentIdentityConnectionState();

        expect(result).toEqual({
          status: "success",
          currentStep:
            "relevant_first_job",
          connectionWorking: null,
        });
      },
    );

    it(
      "fails closed before RPC when authentication cannot be verified",
      async () => {
        mocks.getClaims.mockResolvedValue({
          data: {
            claims: {},
          },
          error: null,
        });

        const result =
          await resolveCurrentIdentityConnectionState();

        expect(result).toEqual({
          status: "unauthenticated",
        });

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "preserves step-not-available truth",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status:
              "step_not_available",
            current_step:
              "starter_composition",
          },
          error: null,
        });

        const result =
          await resolveCurrentIdentityConnectionState();

        expect(result).toEqual({
          status:
            "step_not_available",
          currentStep:
            "starter_composition",
        });
      },
    );

    it(
      "rejects unknown Working shape instead of trusting database output",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            current_step:
              "relevant_first_job",
            connection_working: {
              connection_kind:
                "admin_link",
              social_platform:
                null,
              destination_url:
                "https://example.com",
              revision: 1,
            },
          },
          error: null,
        });

        await expect(
          resolveCurrentIdentityConnectionState(),
        ).rejects.toThrow(
          "Identity Connection resolver returned an invalid payload.",
        );
      },
    );
  },
);