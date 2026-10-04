import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  schema: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(),
  ensureExternalDestinationPending:
    vi.fn(),
  scanAndRecordPendingExternalDestination:
    vi.fn(),
}));

vi.mock(
  "@/lib/supabase/server",
  () => ({
    createClient:
      mocks.createClient,
  }),
);

vi.mock(
  "@/lib/external-destination/safety",
  () => ({
    ensureExternalDestinationPending:
      mocks.ensureExternalDestinationPending,
  }),
);

vi.mock(
  "@/lib/external-destination/trusted-recorder",
  () => ({
    scanAndRecordPendingExternalDestination:
      mocks.scanAndRecordPendingExternalDestination,
  }),
);

vi.mock(
  "next/navigation",
  () => ({
    redirect:
      mocks.redirect,
  }),
);

import {
  saveProductDraftAction,
} from "./actions";
import type {
  ProductDraftActionState,
} from "./state";

const previousState:
  ProductDraftActionState = {
    status: "idle",
    message: null,
    sourceUrl: "",
    title: "",
    fieldErrors: {},
  };

function createFormData(
  sourceUrl: string,
  title: string = "",
  revision: string = "",
): FormData {
  const formData =
    new FormData();

  formData.set(
    "sourceUrl",
    sourceUrl,
  );

  formData.set(
    "title",
    title,
  );

  formData.set(
    "baseProductRevision",
    revision,
  );

  return formData;
}

describe(
  "saveProductDraftAction",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.schema.mockReturnValue({
        rpc: mocks.rpc,
      });

      mocks.createClient.mockResolvedValue({
        schema: mocks.schema,
      });

      mocks.ensureExternalDestinationPending
        .mockResolvedValue({
          normalizedUrl:
            "https://shop.example.com/product",
          hostname:
            "shop.example.com",
          riskSignals: [],
          urlHash:
            "a".repeat(64),
          requiresScan:
            true,
          revision:
            1,
        });

      mocks.scanAndRecordPendingExternalDestination
        .mockResolvedValue({
          safetyStatus:
            "safe",
        });

      mocks.redirect.mockImplementation(
        (destination: string) => {
          throw new Error(
            `REDIRECT:${destination}`,
          );
        },
      );
    });

    it(
      "rejects dangerous Product URL schemes before database access",
      async () => {
        const result =
          await saveProductDraftAction(
            previousState,
            createFormData(
              "javascript:alert(1)",
            ),
          );

        expect(result.status)
          .toBe("error");

        expect(
          result.fieldErrors.sourceUrl,
        ).toBeDefined();

        expect(
          mocks.createClient,
        ).not.toHaveBeenCalled();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      " https://shop.example.com/product",
      "https://shop.example.com/product ",
      "https://localhost/product",
      "https://127.0.0.1/product",
      "https://user@shop.example.com/product",
      "https://shop.example.com:8443/product",
      "https://shop.example.com/#/product",
    ])(
      "rejects unsafe Product destination before Owner RPC: %s",
      async (sourceUrl) => {
        const result =
          await saveProductDraftAction(
            previousState,
            createFormData(
              sourceUrl,
            ),
          );

        expect(result.status)
          .toBe("error");

        expect(
          result.fieldErrors.sourceUrl,
        ).toBeDefined();

        expect(
          mocks.createClient,
        ).not.toHaveBeenCalled();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();

        expect(
          mocks.ensureExternalDestinationPending,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an overlong title before database access",
      async () => {
        const result =
          await saveProductDraftAction(
            previousState,
            createFormData(
              "https://shop.example.com/product",
              "x".repeat(161),
            ),
          );

        expect(
          result.fieldErrors.title,
        ).toBeDefined();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses only the narrow current-Owner Product RPC with normalized input",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "stale_write",
          },
          error: null,
        });

        await saveProductDraftAction(
          previousState,
          createFormData(
            "https://shop.example.com/product",
            " First Product ",
            "2",
          ),
        );

        expect(
          mocks.schema,
        ).toHaveBeenCalledWith(
          "api",
        );

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "save_current_owner_product_draft",
          {
            input_source_url:
              "https://shop.example.com/product",
            input_title:
              "First Product",
            base_product_revision:
              2,
          },
        );
      },
    );

    it(
      "surfaces stale Product Draft instead of silently overwriting it",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "stale_write",
          },
          error: null,
        });

        const result =
          await saveProductDraftAction(
            previousState,
            createFormData(
              "https://shop.example.com/product",
              "First Product",
              "2",
            ),
          );

        expect(result).toEqual({
          status: "error",
          message:
            "This Product Draft changed in another tab or session. Reload the page before saving again.",
          sourceUrl:
            "https://shop.example.com/product",
          title:
            "First Product",
          fieldErrors: {},
        });

        expect(
          mocks.redirect,
        ).not.toHaveBeenCalled();

        expect(
          mocks.ensureExternalDestinationPending,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "redirects back to S5 after an acknowledged Product Draft save",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            current_step:
              "relevant_first_job",
            product_draft: {
              source_url:
                "https://shop.example.com/product",
              title: null,
              revision: 1,
            },
          },
          error: null,
        });

        await expect(
          saveProductDraftAction(
            previousState,
            createFormData(
              "https://shop.example.com/product",
            ),
          ),
        ).rejects.toThrow(
          "REDIRECT:/onboarding?step=relevant_first_job",
        );

        expect(
          mocks.ensureExternalDestinationPending,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.ensureExternalDestinationPending,
        ).toHaveBeenCalledWith(
          "https://shop.example.com/product",
        );

        // Product success invokes trusted recorder.
        expect(
          mocks.scanAndRecordPendingExternalDestination,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.redirect,
        ).toHaveBeenCalledWith(
          "/onboarding?step=relevant_first_job",
        );
      },
    );

    it(
      "keeps acknowledged private Product Draft when pending safety registration fails",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status:
              "success",
            current_step:
              "relevant_first_job",
            product_draft: {
              source_url:
                "https://shop.example.com/product",
              title:
                "First Product",
              revision:
                1,
            },
          },
          error: null,
        });

        mocks.ensureExternalDestinationPending
          .mockRejectedValue(
            new Error(
              "simulated safety registration failure",
            ),
          );

        await expect(
          saveProductDraftAction(
            previousState,
            createFormData(
              "https://shop.example.com/product",
              "First Product",
            ),
          ),
        ).rejects.toThrow(
          "REDIRECT:/onboarding?step=relevant_first_job",
        );

        expect(
          mocks.rpc,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.ensureExternalDestinationPending,
        ).toHaveBeenCalledWith(
          "https://shop.example.com/product",
        );

        // Product success invokes trusted recorder.
        expect(
          mocks.scanAndRecordPendingExternalDestination,
        ).not.toHaveBeenCalled();

        expect(
          mocks.redirect,
        ).toHaveBeenCalledWith(
          "/onboarding?step=relevant_first_job",
        );
      },
    );
    it(
      "keeps acknowledged private Product Draft when destination scanning fails",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status:
              "success",
            current_step:
              "relevant_first_job",
            product_draft: {
              source_url:
                "https://shop.example.com/product",
              title:
                "First Product",
              revision:
                1,
            },
          },
          error:
            null,
        });

        mocks.scanAndRecordPendingExternalDestination
          .mockRejectedValue(
            new Error(
              "simulated scanner failure",
            ),
          );

        await expect(
          saveProductDraftAction(
            previousState,
            createFormData(
              "https://shop.example.com/product",
              "First Product",
            ),
          ),
        ).rejects.toThrow(
          "REDIRECT:/onboarding?step=relevant_first_job",
        );

        expect(
          mocks.ensureExternalDestinationPending,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.scanAndRecordPendingExternalDestination,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.redirect,
        ).toHaveBeenCalledWith(
          "/onboarding?step=relevant_first_job",
        );
      },
    );
  },
);