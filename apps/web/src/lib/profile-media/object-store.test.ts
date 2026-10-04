import {
  DeleteObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  PROFILE_MEDIA_MAX_CANONICAL_BYTES,
} from "@spall-spill/profile-media-policy";

const mocks = vi.hoisted(
  () => ({
    send: vi.fn(),
  }),
);

vi.mock(
  "@/lib/profile-media/r2",
  () => ({
    createProfileMediaR2Connection:
      () => ({
        client: {
          send:
            mocks.send,
        },

        bucket:
          "profile-media-test-bucket",
      }),
  }),
);

import {
  deleteProfileMediaStagingObjectBestEffort,
  putCanonicalProfileMediaObject,
} from "@/lib/profile-media/object-store";

function createMinimalWebp():
  Buffer {
  const bytes =
    Buffer.alloc(12);

  bytes.write(
    "RIFF",
    0,
    "ascii",
  );

  bytes.writeUInt32LE(
    4,
    4,
  );

  bytes.write(
    "WEBP",
    8,
    "ascii",
  );

  return bytes;
}

describe(
  "Profile Media object store",
  () => {
    beforeEach(() => {
      mocks.send.mockReset();
    });

    it(
      "creates canonical WebP with immutable conditional PutObject semantics",
      async () => {
        const bytes =
          createMinimalWebp();

        mocks.send
          .mockResolvedValue({});

        const objectKey =
          "working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp";

        await putCanonicalProfileMediaObject({
          objectKey,
          bytes,
        });

        expect(
          mocks.send,
        ).toHaveBeenCalledTimes(
          1,
        );

        const command =
          mocks.send.mock
            .calls[0]?.[0];

        expect(command)
          .toBeInstanceOf(
            PutObjectCommand,
          );

        const input =
          (
            command as
              PutObjectCommand
          ).input;

        expect(
          input.Bucket,
        ).toBe(
          "profile-media-test-bucket",
        );

        expect(
          input.Key,
        ).toBe(objectKey);

        expect(
          input.ContentType,
        ).toBe(
          PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
        );

        expect(
          input.ContentLength,
        ).toBe(
          bytes.byteLength,
        );

        expect(
          input.IfNoneMatch,
        ).toBe("*");
      },
    );

    it(
      "rejects writes outside the canonical namespace",
      async () => {
        await expect(
          putCanonicalProfileMediaObject({
            objectKey:
              "staging/profile/evil.webp",

            bytes:
              createMinimalWebp(),
          }),
        ).rejects.toThrow();

        expect(
          mocks.send,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects malformed canonical bytes before R2",
      async () => {
        await expect(
          putCanonicalProfileMediaObject({
            objectKey:
              "working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp",

            bytes:
              Buffer.from(
                "<script>evil()</script>",
              ),
          }),
        ).rejects.toThrow();

        expect(
          mocks.send,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects canonical bytes above the authoritative ceiling",
      async () => {
        const oversized =
          Buffer.alloc(
            PROFILE_MEDIA_MAX_CANONICAL_BYTES +
              1,
          );

        await expect(
          putCanonicalProfileMediaObject({
            objectKey:
              "working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp",

            bytes:
              oversized,
          }),
        ).rejects.toThrow();

        expect(
          mocks.send,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "treats valid staging deletion failure as best effort",
      async () => {
        mocks.send.mockRejectedValue(
          new Error(
            "Simulated delete failure.",
          ),
        );

        await expect(
          deleteProfileMediaStagingObjectBestEffort(
            "staging/profile/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222",
          ),
        ).resolves.toBeUndefined();

        expect(
          mocks.send,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          mocks.send.mock
            .calls[0]?.[0],
        ).toBeInstanceOf(
          DeleteObjectCommand,
        );
      },
    );

    it(
      "refuses to let staging cleanup delete canonical objects",
      async () => {
        await deleteProfileMediaStagingObjectBestEffort(
          "working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp",
        );

        expect(
          mocks.send,
        ).not.toHaveBeenCalled();
      },
    );
  },
);