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
  saveIdentityConnectionAction,
} from "./actions";
import type {
  IdentityConnectionActionState,
} from "./state";

const previousState:
  IdentityConnectionActionState = {
    status: "idle",
    message: null,
    connectionKind: "social",
    socialPlatform: "",
    destinationUrl: "",
    fieldErrors: {},
  };

function createFormData(
  kind: string,
  platform: string,
  destination: string,
  revision: string = "",
): FormData {
  const formData =
    new FormData();

  formData.set(
    "connectionKind",
    kind,
  );

  if (platform.length > 0) {
    formData.set(
      "socialPlatform",
      platform,
    );
  }

  formData.set(
    "destinationUrl",
    destination,
  );

  formData.set(
    "baseConnectionRevision",
    revision,
  );

  return formData;
}

describe(
  "saveIdentityConnectionAction",
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
            "https://example.com/",
          hostname:
            "example.com",
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
      "rejects dangerous destination schemes before database access",
      async () => {
        const result =
          await saveIdentityConnectionAction(
            previousState,
            createFormData(
              "generic_link",
              "",
              "javascript:alert(1)",
            ),
          );

        expect(result.status)
          .toBe("error");

        expect(
          result.fieldErrors
            .destinationUrl,
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
      " https://example.com",
      "https://example.com ",
      "https://localhost/test",
      "https://127.0.0.1/test",
      "https://user@example.com/test",
      "https://example.com:8443/test",
      "https://example.com/#/login",
    ])(
      "rejects unsafe external destination before Owner RPC: %s",
      async (destination) => {
        const result =
          await saveIdentityConnectionAction(
            previousState,
            createFormData(
              "generic_link",
              "",
              destination,
            ),
          );

        expect(result.status)
          .toBe("error");

        expect(
          result.fieldErrors
            .destinationUrl,
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
      "requires a structured platform for Social",
      async () => {
        const result =
          await saveIdentityConnectionAction(
            previousState,
            createFormData(
              "social",
              "",
              "https://example.com/natsx",
            ),
          );

        expect(
          result.fieldErrors
            .socialPlatform,
        ).toBeDefined();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses only the narrow current-Owner RPC with normalized input",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "stale_write",
          },
          error: null,
        });

        await saveIdentityConnectionAction(
          previousState,
          createFormData(
            " SOCIAL ",
            " Instagram ",
            "https://Instagram.COM/natsx",
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
          "save_current_owner_identity_connection",
          {
            input_connection_kind:
              "social",
            input_social_platform:
              "instagram",
            input_destination_url:
              "https://instagram.com/natsx",
            base_connection_revision:
              2,
          },
        );
      },
    );

    it(
      "surfaces stale Working instead of silently overwriting it",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "stale_write",
          },
          error: null,
        });

        const result =
          await saveIdentityConnectionAction(
            previousState,
            createFormData(
              "generic_link",
              "",
              "https://example.com",
              "2",
            ),
          );

        expect(result).toEqual({
          status: "error",
          message:
            "This Identity Connection changed in another tab or session. Reload the page before saving again.",
          connectionKind:
            "generic_link",
          socialPlatform: "",
          destinationUrl:
            "https://example.com/",
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
      "redirects back to S5 after an acknowledged save without advancing progress",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status: "success",
            current_step:
              "relevant_first_job",
            connection_working: {
              connection_kind:
                "generic_link",
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
          saveIdentityConnectionAction(
            previousState,
            createFormData(
              "generic_link",
              "",
              "https://example.com",
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
          "https://example.com/",
        );

        // Identity success invokes trusted recorder.
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
      "keeps acknowledged private Working save when pending safety registration fails",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status:
              "success",
            current_step:
              "relevant_first_job",
            connection_working: {
              connection_kind:
                "generic_link",
              social_platform:
                null,
              destination_url:
                "https://example.com/",
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
          saveIdentityConnectionAction(
            previousState,
            createFormData(
              "generic_link",
              "",
              "https://example.com",
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
          "https://example.com/",
        );

        // Identity success invokes trusted recorder.
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
      "keeps acknowledged private Working save when destination scanning fails",
      async () => {
        mocks.rpc.mockResolvedValue({
          data: {
            status:
              "success",
            current_step:
              "relevant_first_job",
            connection_working: {
              connection_kind:
                "generic_link",
              social_platform:
                null,
              destination_url:
                "https://example.com/",
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
          saveIdentityConnectionAction(
            previousState,
            createFormData(
              "generic_link",
              "",
              "https://example.com",
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