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
  resolveCurrentRelevantFirstJobState,
  resolveCurrentStarterCompositionState,
} from "./state";

describe(
  "resolveCurrentStarterCompositionState",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getClaims.mockResolvedValue({
        data: {
          claims: {
            sub:
              "60000000-0000-4000-8000-000000000001",
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
          layout_working: {
            starter_key:
              "featured",
            revision: 3,
          },
        },
        error: null,
      });
    });

    it(
      "returns authenticated current-Owner acknowledged Layout Working",
      async () => {
        const result =
          await resolveCurrentStarterCompositionState();

        expect(result).toEqual({
          status: "success",
          layoutWorking: {
            starterKey:
              "featured",
            revision: 3,
          },
        });

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "resolve_current_starter_composition_state",
        );
      },
    );

    it(
      "preserves the explicit no-Layout-Working creation boundary",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            layout_working: null,
          },
          error: null,
        });

        const result =
          await resolveCurrentStarterCompositionState();

        expect(result).toEqual({
          status: "success",
          layoutWorking: null,
        });
      },
    );

    it(
      "fails closed before the RPC when authentication cannot be verified",
      async () => {
        mocks.getClaims.mockResolvedValue({
          data: {
            claims: {},
          },
          error: null,
        });

        const result =
          await resolveCurrentStarterCompositionState();

        expect(result).toEqual({
          status: "unauthenticated",
        });

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an invalid database payload instead of trusting an unknown Starter key",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            layout_working: {
              starter_key:
                "foreign_starter",
              revision: 1,
            },
          },
          error: null,
        });

        await expect(
          resolveCurrentStarterCompositionState(),
        ).rejects.toThrow(
          "Starter Composition resolver returned an invalid payload.",
        );
      },
    );
  },
);
describe(
  "resolveCurrentRelevantFirstJobState",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getClaims.mockResolvedValue({
        data: {
          claims: {
            sub:
              "70000000-0000-4000-8000-000000000001",
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
          primary_use_case:
            "affiliate",
          recommended_first_job:
            "product",
          progress_revision: 5,
        },
        error: null,
      });
    });

    it(
      "returns validated adaptive S5 guidance",
      async () => {
        const result =
          await resolveCurrentRelevantFirstJobState();

        expect(result).toEqual({
          status: "success",
          currentStep:
            "relevant_first_job",
          primaryUseCase:
            "affiliate",
          recommendedFirstJob:
            "product",
          progressRevision: 5,
        });

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "resolve_current_relevant_first_job_state",
        );
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
          await resolveCurrentRelevantFirstJobState();

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
            progress_revision: 4,
          },
          error: null,
        });

        const result =
          await resolveCurrentRelevantFirstJobState();

        expect(result).toEqual({
          status:
            "step_not_available",
          currentStep:
            "starter_composition",
          progressRevision: 4,
        });
      },
    );

    it(
      "rejects unknown recommendation values",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            current_step:
              "relevant_first_job",
            primary_use_case:
              "affiliate",
            recommended_first_job:
              "admin_override",
            progress_revision: 5,
          },
          error: null,
        });

        await expect(
          resolveCurrentRelevantFirstJobState(),
        ).rejects.toThrow(
          "Relevant First Job resolver returned an invalid payload.",
        );
      },
    );
  },
);
