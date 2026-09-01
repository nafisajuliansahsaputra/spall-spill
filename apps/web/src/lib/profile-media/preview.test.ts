import {
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  PROFILE_MEDIA_PRESIGNED_GET_TTL_SECONDS,
} from "@/lib/profile-media/contracts";

const mocks = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
  connection: vi.fn(),
}));

vi.mock(
  "@aws-sdk/s3-request-presigner",
  () => ({
    getSignedUrl:
      mocks.getSignedUrl,
  }),
);

vi.mock(
  "@/lib/profile-media/r2",
  () => ({
    createProfileMediaR2Connection:
      mocks.connection,
  }),
);

import {
  createTrustedProfileMediaPreviewUrl,
} from "@/lib/profile-media/preview";

const ASSET_KEY =
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe(
  "createTrustedProfileMediaPreviewUrl",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.connection.mockReturnValue(
        {
          client: {
            send: vi.fn(),
          },
          bucket:
            "profile-media-test-bucket",
        },
      );

      mocks.getSignedUrl.mockResolvedValue(
        "https://example.invalid/signed-read",
      );
    });

    it(
      "signs only the canonical Working object derived from a trusted UUID asset key",
      async () => {
        const result =
          await createTrustedProfileMediaPreviewUrl(
            ASSET_KEY,
          );

        expect(result).toBe(
          "https://example.invalid/signed-read",
        );

        expect(
          mocks.connection,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.getSignedUrl,
        ).toHaveBeenCalledTimes(1);

        const command =
          mocks.getSignedUrl.mock
            .calls[0]?.[1];

        expect(
          command,
        ).toBeInstanceOf(
          GetObjectCommand,
        );

        const input =
          (
            command as
              GetObjectCommand
          ).input;

        expect(
          input.Bucket,
        ).toBe(
          "profile-media-test-bucket",
        );

        expect(
          input.Key,
        ).toBe(
          `working/profile/${ASSET_KEY}.webp`,
        );

        expect(
          mocks.getSignedUrl.mock
            .calls[0]?.[2],
        ).toEqual({
          expiresIn:
            PROFILE_MEDIA_PRESIGNED_GET_TTL_SECONDS,
        });
      },
    );

    it(
      "rejects a non-UUID asset key before touching R2",
      async () => {
        const result =
          await createTrustedProfileMediaPreviewUrl(
            "../../../private-object",
          );

        expect(result).toBeNull();

        expect(
          mocks.connection,
        ).not.toHaveBeenCalled();

        expect(
          mocks.getSignedUrl,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed to no preview when signing is temporarily unavailable",
      async () => {
        mocks.getSignedUrl.mockRejectedValue(
          new Error(
            "Simulated signing failure.",
          ),
        );

        const result =
          await createTrustedProfileMediaPreviewUrl(
            ASSET_KEY,
          );

        expect(result).toBeNull();
      },
    );

    it(
      "fails closed to no preview when R2 configuration is unavailable",
      async () => {
        mocks.connection.mockImplementation(
          () => {
            throw new Error(
              "Simulated R2 configuration failure.",
            );
          },
        );

        const result =
          await createTrustedProfileMediaPreviewUrl(
            ASSET_KEY,
          );

        expect(result).toBeNull();

        expect(
          mocks.getSignedUrl,
        ).not.toHaveBeenCalled();
      },
    );
  },
);