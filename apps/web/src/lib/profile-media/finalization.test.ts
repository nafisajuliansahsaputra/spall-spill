import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  events: [] as string[],

  auth: vi.fn(),
  resolve: vi.fn(),
  complete: vi.fn(),

  load: vi.fn(),
  put: vi.fn(),
  deleteStaging: vi.fn(),

  process: vi.fn(),
}));

vi.mock(
  "@/lib/profile-media/auth",
  () => ({
    resolveProfileMediaAuthPrincipal:
      mocks.auth,
  }),
);

vi.mock(
  "@/lib/profile-media/database",
  () => ({
    resolveProfileMediaUploadIntent:
      mocks.resolve,

    completeProfileMediaUpload:
      mocks.complete,
  }),
);

vi.mock(
  "@/lib/profile-media/object-store",
  () => ({
    loadProfileMediaStagingObject:
      mocks.load,

    putCanonicalProfileMediaObject:
      mocks.put,

    deleteProfileMediaStagingObjectBestEffort:
      mocks.deleteStaging,
  }),
);

vi.mock(
  "@/lib/profile-media/processor",
  () => ({
    processProfileMediaSource:
      mocks.process,
  }),
);

import {
  finalizeProfileMediaUpload,
  ProfileMediaFinalizationError,
} from "@/lib/profile-media/finalization";

const AUTH_USER_ID =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const UPLOAD_INTENT_ID =
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const STAGING_KEY =
  "staging/profile/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const EXPIRES_AT =
  "2026-09-01T12:00:00.000Z";

const EXISTING_ASSET_KEY =
  "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const EXISTING_OBJECT_KEY =
  `working/profile/${EXISTING_ASSET_KEY}.webp`;

type CompletionInput =
  Readonly<{
    authUserId: string;
    uploadIntentId: string;
    assetKey: string;
    objectKey: string;
    byteSize: number;
    width: number;
    height: number;
  }>;

function installSuccessfulPipeline():
  void {
  mocks.auth.mockImplementation(
    async () => {
      mocks.events.push(
        "auth",
      );

      return {
        status:
          "authenticated",
        authUserId:
          AUTH_USER_ID,
      };
    },
  );

  mocks.resolve.mockImplementation(
    async () => {
      mocks.events.push(
        "resolve",
      );

      return {
        status: "success",
        intent_status:
          "processing",
        expected_content_type:
          "image/png",
        declared_byte_size:
          4,
        staging_object_key:
          STAGING_KEY,
        expires_at:
          EXPIRES_AT,
      };
    },
  );

  mocks.load.mockImplementation(
    async () => {
      mocks.events.push(
        "load",
      );

      return {
        bytes:
          Buffer.from([
            1,
            2,
            3,
            4,
          ]),
        contentType:
          "image/png",
        byteSize: 4,
      };
    },
  );

  mocks.process.mockImplementation(
    async () => {
      mocks.events.push(
        "process",
      );

      const bytes =
        Buffer.from([
          9,
          8,
          7,
        ]);

      return {
        bytes,
        contentType:
          "image/webp",
        byteSize:
          bytes.byteLength,
        width: 320,
        height: 180,
      };
    },
  );

  mocks.put.mockImplementation(
    async () => {
      mocks.events.push(
        "put",
      );
    },
  );

  mocks.complete.mockImplementation(
    async (
      input:
        CompletionInput,
    ) => {
      mocks.events.push(
        "complete",
      );

      return {
        status: "success",
        idempotent: false,
        asset_key:
          input.assetKey,
        object_key:
          input.objectKey,
        stored_content_type:
          "image/webp",
        byte_size:
          input.byteSize,
        width:
          input.width,
        height:
          input.height,
      };
    },
  );

  mocks.deleteStaging.mockImplementation(
    async () => {
      mocks.events.push(
        "delete",
      );
    },
  );
}

describe(
  "finalizeProfileMediaUpload",
  () => {
    beforeEach(() => {
      mocks.events.length = 0;

      vi.clearAllMocks();

      installSuccessfulPipeline();
    });

    it(
      "fails closed before database or R2 access when the request is unauthenticated",
      async () => {
        mocks.auth.mockResolvedValue(
          {
            status:
              "unauthenticated",
          },
        );

        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          );

        expect(
          result,
        ).toEqual({
          status:
            "unauthenticated",
        });

        expect(
          mocks.resolve,
        ).not.toHaveBeenCalled();

        expect(
          mocks.load,
        ).not.toHaveBeenCalled();

        expect(
          mocks.put,
        ).not.toHaveBeenCalled();

        expect(
          mocks.complete,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an invalid upload intent identifier before privileged resolution",
      async () => {
        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                "../../../etc/passwd",
            },
          );

        expect(
          result,
        ).toEqual({
          status:
            "invalid_upload_intent",
        });

        expect(
          mocks.resolve,
        ).not.toHaveBeenCalled();

        expect(
          mocks.load,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not run a second canonicalization pipeline while the intent is already processing",
      async () => {
        mocks.resolve.mockResolvedValue(
          {
            status:
              "processing",
            expires_at:
              EXPIRES_AT,
          },
        );

        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          );

        expect(
          result,
        ).toEqual({
          status:
            "processing",
        });

        expect(
          mocks.load,
        ).not.toHaveBeenCalled();

        expect(
          mocks.process,
        ).not.toHaveBeenCalled();

        expect(
          mocks.put,
        ).not.toHaveBeenCalled();

        expect(
          mocks.complete,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns an already-consumed canonical asset idempotently without touching R2",
      async () => {
        mocks.resolve.mockResolvedValue(
          {
            status:
              "consumed",
            asset_key:
              EXISTING_ASSET_KEY,
            object_key:
              EXISTING_OBJECT_KEY,
            stored_content_type:
              "image/webp",
            byte_size:
              12345,
            width: 512,
            height: 512,
          },
        );

        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          );

        expect(
          result,
        ).toEqual({
          status: "success",
          assetKey:
            EXISTING_ASSET_KEY,
          contentType:
            "image/webp",
          byteSize: 12345,
          width: 512,
          height: 512,
          idempotent: true,
        });

        expect(
          mocks.load,
        ).not.toHaveBeenCalled();

        expect(
          mocks.process,
        ).not.toHaveBeenCalled();

        expect(
          mocks.put,
        ).not.toHaveBeenCalled();

        expect(
          mocks.complete,
        ).not.toHaveBeenCalled();

        expect(
          mocks.deleteStaging,
        ).not.toHaveBeenCalled();
      },
    );

    it.each([
      "expired",
      "rejected",
    ] as const)(
      "does not process R2 content when the authoritative intent is %s",
      async (status) => {
        mocks.resolve.mockResolvedValue(
          {
            status,
          },
        );

        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          );

        expect(
          result,
        ).toEqual({
          status,
        });

        expect(
          mocks.load,
        ).not.toHaveBeenCalled();

        expect(
          mocks.process,
        ).not.toHaveBeenCalled();

        expect(
          mocks.put,
        ).not.toHaveBeenCalled();

        expect(
          mocks.complete,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "executes finalization in the locked safe canonicalization order",
      async () => {
        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          );

        expect(
          result.status,
        ).toBe("success");

        expect(
          mocks.events,
        ).toEqual([
          "auth",
          "resolve",
          "load",
          "process",
          "put",
          "complete",
          "delete",
        ]);
      },
    );

    it(
      "generates canonical storage identity server-side and never reuses the staging key",
      async () => {
        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          );

        expect(
          result.status,
        ).toBe("success");

        expect(
          mocks.put,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.complete,
        ).toHaveBeenCalledTimes(1);

        const putInput =
          mocks.put.mock
            .calls[0]?.[0] as
            | {
                objectKey:
                  string;
                bytes:
                  Buffer;
              }
            | undefined;

        const completionInput =
          mocks.complete.mock
            .calls[0]?.[0] as
            | CompletionInput
            | undefined;

        expect(
          putInput,
        ).toBeDefined();

        expect(
          completionInput,
        ).toBeDefined();

        expect(
          putInput?.objectKey,
        ).toMatch(
          /^working\/profile\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/,
        );

        expect(
          putInput?.objectKey,
        ).not.toBe(
          STAGING_KEY,
        );

        expect(
          putInput?.objectKey,
        ).not.toContain(
          "staging/profile/",
        );

        const assetKey =
          putInput?.objectKey
            .replace(
              "working/profile/",
              "",
            )
            .replace(
              ".webp",
              "",
            );

        expect(
          completionInput
            ?.assetKey,
        ).toBe(assetKey);

        expect(
          completionInput
            ?.objectKey,
        ).toBe(
          putInput?.objectKey,
        );

        if (
          result.status ===
          "success"
        ) {
          expect(
            result.assetKey,
          ).toBe(assetKey);
        }
      },
    );

    it(
      "does not process or register anything when authoritative staging load fails",
      async () => {
        mocks.load.mockImplementation(
          async () => {
            mocks.events.push(
              "load",
            );

            throw new Error(
              "Simulated staging failure.",
            );
          },
        );

        await expect(
          finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          ),
        ).rejects.toThrow(
          "Simulated staging failure.",
        );

        expect(
          mocks.process,
        ).not.toHaveBeenCalled();

        expect(
          mocks.put,
        ).not.toHaveBeenCalled();

        expect(
          mocks.complete,
        ).not.toHaveBeenCalled();

        expect(
          mocks.deleteStaging,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not create a canonical object when image processing rejects the source",
      async () => {
        mocks.process.mockImplementation(
          async () => {
            mocks.events.push(
              "process",
            );

            throw new Error(
              "Simulated decode rejection.",
            );
          },
        );

        await expect(
          finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          ),
        ).rejects.toThrow(
          "Simulated decode rejection.",
        );

        expect(
          mocks.put,
        ).not.toHaveBeenCalled();

        expect(
          mocks.complete,
        ).not.toHaveBeenCalled();

        expect(
          mocks.deleteStaging,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not register database metadata when canonical R2 creation fails",
      async () => {
        mocks.put.mockImplementation(
          async () => {
            mocks.events.push(
              "put",
            );

            throw new Error(
              "Simulated canonical R2 failure.",
            );
          },
        );

        await expect(
          finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          ),
        ).rejects.toThrow(
          "Simulated canonical R2 failure.",
        );

        expect(
          mocks.complete,
        ).not.toHaveBeenCalled();

        expect(
          mocks.deleteStaging,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not delete staging when authoritative asset registration fails",
      async () => {
        mocks.complete.mockImplementation(
          async () => {
            mocks.events.push(
              "complete",
            );

            return {
              status:
                "asset_conflict",
            };
          },
        );

        await expect(
          finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          ),
        ).rejects.toBeInstanceOf(
          ProfileMediaFinalizationError,
        );

        expect(
          mocks.put,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.deleteStaging,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed if Owner eligibility disappears between processing and database completion",
      async () => {
        mocks.complete.mockImplementation(
          async () => {
            mocks.events.push(
              "complete",
            );

            return {
              status:
                "owner_not_eligible",
            };
          },
        );

        const result =
          await finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          );

        expect(
          result,
        ).toEqual({
          status:
            "owner_unavailable",
        });

        expect(
          mocks.put,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.deleteStaging,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "treats a consumed intent without its canonical database asset as an invariant failure",
      async () => {
        mocks.resolve.mockResolvedValue(
          {
            status:
              "asset_missing",
          },
        );

        await expect(
          finalizeProfileMediaUpload(
            {
              uploadIntentId:
                UPLOAD_INTENT_ID,
            },
          ),
        ).rejects.toBeInstanceOf(
          ProfileMediaFinalizationError,
        );

        expect(
          mocks.load,
        ).not.toHaveBeenCalled();

        expect(
          mocks.put,
        ).not.toHaveBeenCalled();
      },
    );
  },
);