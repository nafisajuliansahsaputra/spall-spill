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
  resolveCurrentProductDraftState,
} from "./state";

describe(
  "resolveCurrentProductDraftState",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getClaims.mockResolvedValue({
        data: {
          claims: {
            sub:
              "72000000-0000-4000-8000-000000000001",
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
          product_draft: {
            source_url:
              "https://shop.example.com/product",
            title:
              "First Product",
            revision: 2,
          },
        },
        error: null,
      });
    });

    it(
      "returns validated current-Owner Product Draft",
      async () => {
        const result =
          await resolveCurrentProductDraftState();

        expect(result).toEqual({
          status: "success",
          currentStep:
            "relevant_first_job",
          productDraft: {
            sourceUrl:
              "https://shop.example.com/product",
            title:
              "First Product",
            revision: 2,
          },
        });

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "resolve_current_product_draft_state",
        );
      },
    );

    it(
      "preserves the explicit no-Product-Draft boundary",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            current_step:
              "relevant_first_job",
            product_draft: null,
          },
          error: null,
        });

        const result =
          await resolveCurrentProductDraftState();

        expect(result).toEqual({
          status: "success",
          currentStep:
            "relevant_first_job",
          productDraft: null,
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
          await resolveCurrentProductDraftState();

        expect(result).toEqual({
          status:
            "unauthenticated",
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
          await resolveCurrentProductDraftState();

        expect(result).toEqual({
          status:
            "step_not_available",
          currentStep:
            "starter_composition",
        });
      },
    );

    it(
      "rejects Product Draft payloads that expose unexpected internal identity",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            current_step:
              "relevant_first_job",
            product_draft: {
              id:
                "72000000-0000-4000-8000-000000000099",
              source_url:
                "https://shop.example.com/product",
              title: null,
              revision: 1,
            },
          },
          error: null,
        });

        await expect(
          resolveCurrentProductDraftState(),
        ).rejects.toThrow(
          "Product Draft resolver returned an invalid payload.",
        );
      },
    );
  },
);