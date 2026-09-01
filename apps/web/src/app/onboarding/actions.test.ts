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
}));

vi.mock(
  "@/lib/supabase/server",
  () => ({
    createClient:
      mocks.createClient,
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
  saveBasicIdentityAction,
} from "./actions";
import type {
  BasicIdentityActionState,
} from "./state";

const ASSET_KEY =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const previousState:
  BasicIdentityActionState = {
    status: "idle",
    message: null,
    displayName: "",
    bio: "",
    profileAssetKey: null,
    fieldErrors: {},
  };

function createFormData(
  profileAssetKey:
    string | null,
): FormData {
  const formData =
    new FormData();

  formData.set(
    "displayName",
    "Natsx",
  );

  formData.set(
    "bio",
    "Builder",
  );

  formData.set(
    "baseIdentityRevision",
    "2",
  );

  formData.set(
    "baseProgressRevision",
    "4",
  );

  formData.set(
    "profileAssetKey",
    profileAssetKey ?? "",
  );

  return formData;
}

describe(
  "saveBasicIdentityAction Profile Media boundary",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.schema.mockReturnValue(
        {
          rpc: mocks.rpc,
        },
      );

      mocks.createClient.mockResolvedValue(
        {
          schema:
            mocks.schema,
        },
      );

      mocks.rpc.mockResolvedValue(
        {
          data: {
            status:
              "stale_write",
          },
          error: null,
        },
      );
    });

    it(
      "rejects a malformed asset key before database access",
      async () => {
        const result =
          await saveBasicIdentityAction(
            previousState,
            createFormData(
              "../../../other-owner-object",
            ),
          );

        expect(
          result.status,
        ).toBe("error");

        expect(
          result.fieldErrors
            .profileMedia,
        ).toBeDefined();

        expect(
          mocks.createClient,
        ).not.toHaveBeenCalled();

        expect(
          mocks.rpc,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uses the media-aware five-argument RPC with the selected canonical asset key",
      async () => {
        await saveBasicIdentityAction(
          previousState,
          createFormData(
            ASSET_KEY,
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
          "save_current_owner_basic_identity",
          {
            input_display_name:
              "Natsx",
            input_bio:
              "Builder",
            input_profile_asset_key:
              ASSET_KEY,
            base_identity_revision:
              2,
            base_progress_revision:
              4,
          },
        );
      },
    );

    it(
      "submits explicit no-media selection as null rather than preserving an implicit old value",
      async () => {
        await saveBasicIdentityAction(
          previousState,
          createFormData(null),
        );

        expect(
          mocks.rpc,
        ).toHaveBeenCalledWith(
          "save_current_owner_basic_identity",
          expect.objectContaining({
            input_profile_asset_key:
              null,
          }),
        );
      },
    );

    it(
      "maps authoritative invalid_profile_asset without exposing whether a foreign asset exists",
      async () => {
        mocks.rpc.mockResolvedValue(
          {
            data: {
              status:
                "invalid_profile_asset",
            },
            error: null,
          },
        );

        const result =
          await saveBasicIdentityAction(
            previousState,
            createFormData(
              ASSET_KEY,
            ),
          );

        expect(result).toEqual({
          status: "error",
          message:
            "We couldn't safely attach that Profile Photo / Logo. Your last acknowledged Working media is unchanged.",
          displayName: "Natsx",
          bio: "Builder",
          profileAssetKey:
            ASSET_KEY,
          fieldErrors: {
            profileMedia:
              "That media selection is no longer available. Choose another image or reload the page.",
          },
        });
      },
    );
  },
);