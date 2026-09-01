import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCurrentBasicIdentityState:
    vi.fn(),
  createTrustedProfileMediaPreviewUrl:
    vi.fn(),
  initiateProfileMediaUpload:
    vi.fn(),
  finalizeProfileMediaUpload:
    vi.fn(),
  redirect:
    vi.fn(),
}));

vi.mock(
  "@/lib/onboarding/state",
  () => ({
    resolveCurrentBasicIdentityState:
      mocks.resolveCurrentBasicIdentityState,
  }),
);

vi.mock(
  "@/lib/profile-media/preview",
  () => ({
    createTrustedProfileMediaPreviewUrl:
      mocks.createTrustedProfileMediaPreviewUrl,
  }),
);

vi.mock(
  "@/lib/profile-media/initiation",
  () => ({
    initiateProfileMediaUpload:
      mocks.initiateProfileMediaUpload,
  }),
);

vi.mock(
  "@/lib/profile-media/finalization",
  () => ({
    finalizeProfileMediaUpload:
      mocks.finalizeProfileMediaUpload,
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
  refreshSavedProfileMediaPreviewAction,
} from "./profile-media-actions";

const ASSET_KEY =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe(
  "refreshSavedProfileMediaPreviewAction",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.redirect.mockImplementation(
        (destination: string) => {
          throw new Error(
            `REDIRECT:${destination}`,
          );
        },
      );
    });

    it(
      "resolves the current Saved asset on the server and returns a fresh preview URL",
      async () => {
        mocks.resolveCurrentBasicIdentityState.mockResolvedValue(
          {
            status: "success",
            identityWorking: {
              displayName:
                "R2 Runtime Test",
              bio: null,
              profileAssetKey:
                ASSET_KEY,
              revision: 2,
            },
          },
        );

        mocks.createTrustedProfileMediaPreviewUrl.mockResolvedValue(
          "https://example.test/fresh-preview",
        );

        const result =
          await refreshSavedProfileMediaPreviewAction();

        expect(
          mocks.createTrustedProfileMediaPreviewUrl,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.createTrustedProfileMediaPreviewUrl,
        ).toHaveBeenCalledWith(
          ASSET_KEY,
        );

        expect(result).toEqual({
          status: "success",
          assetKey:
            ASSET_KEY,
          previewUrl:
            "https://example.test/fresh-preview",
        });
      },
    );

    it(
      "returns no_saved_media without signing when authoritative Working has no media",
      async () => {
        mocks.resolveCurrentBasicIdentityState.mockResolvedValue(
          {
            status: "success",
            identityWorking: {
              displayName:
                "R2 Runtime Test",
              bio: null,
              profileAssetKey:
                null,
              revision: 3,
            },
          },
        );

        const result =
          await refreshSavedProfileMediaPreviewAction();

        expect(result).toEqual({
          status:
            "no_saved_media",
        });

        expect(
          mocks.createTrustedProfileMediaPreviewUrl,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "preserves the authoritative asset key when preview signing is temporarily unavailable",
      async () => {
        mocks.resolveCurrentBasicIdentityState.mockResolvedValue(
          {
            status: "success",
            identityWorking: {
              displayName:
                "R2 Runtime Test",
              bio: null,
              profileAssetKey:
                ASSET_KEY,
              revision: 4,
            },
          },
        );

        mocks.createTrustedProfileMediaPreviewUrl.mockResolvedValue(
          null,
        );

        const result =
          await refreshSavedProfileMediaPreviewAction();

        expect(result).toEqual({
          status:
            "preview_unavailable",
          assetKey:
            ASSET_KEY,
        });
      },
    );

    it(
      "fails closed when the authoritative Basic Identity resolver fails",
      async () => {
        mocks.resolveCurrentBasicIdentityState.mockRejectedValue(
          new Error(
            "database unavailable",
          ),
        );

        const result =
          await refreshSavedProfileMediaPreviewAction();

        expect(result).toEqual({
          status:
            "internal_error",
        });

        expect(
          mocks.createTrustedProfileMediaPreviewUrl,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "redirects when the current Owner is no longer eligible",
      async () => {
        mocks.resolveCurrentBasicIdentityState.mockResolvedValue(
          {
            status:
              "owner_unavailable",
          },
        );

        await expect(
          refreshSavedProfileMediaPreviewAction(),
        ).rejects.toThrow(
          "REDIRECT:/auth/resolve",
        );

        expect(
          mocks.redirect,
        ).toHaveBeenCalledWith(
          "/auth/resolve",
        );

        expect(
          mocks.createTrustedProfileMediaPreviewUrl,
        ).not.toHaveBeenCalled();
      },
    );
  },
);