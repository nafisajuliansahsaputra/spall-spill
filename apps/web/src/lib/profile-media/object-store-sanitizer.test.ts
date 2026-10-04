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

const mocks = vi.hoisted(
  () => ({
    client: {
      send: vi.fn(),
    },

    getSignedUrl:
      vi.fn(),
  }),
);

vi.mock(
  "@/lib/profile-media/r2",
  () => ({
    createProfileMediaR2Connection:
      () => ({
        client:
          mocks.client,
        bucket:
          "profile-media-test-bucket",
      }),
  }),
);

vi.mock(
  "@aws-sdk/s3-request-presigner",
  () => ({
    getSignedUrl:
      mocks.getSignedUrl,
  }),
);

import {
  createProfileMediaStagingDownloadUrl,
} from "./object-store";

describe(
  "isolated sanitizer staging capability",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      mocks.getSignedUrl
        .mockResolvedValue(
          "https://profile-media-test-bucket.example.test/object?signature=test",
        );
    });

    it(
      "signs only the exact authoritative staging object for a short-lived GET",
      async () => {
        const objectKey =
          "staging/profile/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";

        const result =
          await createProfileMediaStagingDownloadUrl(
            {
              objectKey,
            },
          );

        expect(result)
          .toContain(
            "signature=test",
          );

        expect(
          mocks.getSignedUrl,
        ).toHaveBeenCalledTimes(
          1,
        );

        const command =
          mocks.getSignedUrl.mock
            .calls[0]?.[1];

        expect(command)
          .toBeInstanceOf(
            GetObjectCommand,
          );

        expect(
          (
            command as
              GetObjectCommand
          ).input,
        ).toEqual({
          Bucket:
            "profile-media-test-bucket",
          Key:
            objectKey,
        });

        expect(
          mocks.getSignedUrl.mock
            .calls[0]?.[2],
        ).toEqual({
          expiresIn: 60,
        });
      },
    );
  },
);