import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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
  PROFILE_MEDIA_MAX_SOURCE_BYTES,
} from "@/lib/profile-media/contracts";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock(
  "@/lib/profile-media/r2",
  () => ({
    createProfileMediaR2Connection:
      () => ({
        client: {
          send: mocks.send,
        },
        bucket:
          "profile-media-test-bucket",
      }),
  }),
);

import {
  deleteProfileMediaStagingObjectBestEffort,
  loadProfileMediaStagingObject,
  putCanonicalProfileMediaObject,
} from "@/lib/profile-media/object-store";

function createMockBody(
  bytes: Buffer,
) {
  return {
    transformToByteArray:
      vi.fn(
        async () =>
          Uint8Array.from(bytes),
      ),
  };
}

describe(
  "Profile Media object store",
  () => {
    beforeEach(() => {
      mocks.send.mockReset();
    });

    it(
      "loads the exact staging object using authoritative HEAD and GET metadata",
      async () => {
        const sourceBytes =
          Buffer.from([
            1,
            2,
            3,
            4,
          ]);

        mocks.send.mockImplementation(
          async (
            command: unknown,
          ) => {
            if (
              command instanceof
              HeadObjectCommand
            ) {
              return {
                ContentLength:
                  sourceBytes.byteLength,
                ContentType:
                  "image/png",
              };
            }

            if (
              command instanceof
              GetObjectCommand
            ) {
              return {
                ContentLength:
                  sourceBytes.byteLength,
                ContentType:
                  "image/png",
                Body:
                  createMockBody(
                    sourceBytes,
                  ),
              };
            }

            throw new Error(
              "Unexpected command.",
            );
          },
        );

        const result =
          await loadProfileMediaStagingObject(
            {
              objectKey:
                "staging/profile/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222",
              expectedContentType:
                "image/png",
            },
          );

        expect(
          result.contentType,
        ).toBe("image/png");

        expect(
          result.byteSize,
        ).toBe(
          sourceBytes.byteLength,
        );

        expect(
          Buffer.compare(
            result.bytes,
            sourceBytes,
          ),
        ).toBe(0);

        expect(
          mocks.send,
        ).toHaveBeenCalledTimes(2);

        expect(
          mocks.send.mock.calls[0]?.[0],
        ).toBeInstanceOf(
          HeadObjectCommand,
        );

        expect(
          mocks.send.mock.calls[1]?.[0],
        ).toBeInstanceOf(
          GetObjectCommand,
        );
      },
    );

    it(
      "rejects an authoritative HEAD size above 5 MiB before downloading the object",
      async () => {
        mocks.send.mockResolvedValueOnce(
          {
            ContentLength:
              PROFILE_MEDIA_MAX_SOURCE_BYTES +
              1,
            ContentType:
              "image/jpeg",
          },
        );

        await expect(
          loadProfileMediaStagingObject(
            {
              objectKey:
                "staging/profile/test/oversized",
              expectedContentType:
                "image/jpeg",
            },
          ),
        ).rejects.toThrow();

        expect(
          mocks.send,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.send.mock.calls[0]?.[0],
        ).toBeInstanceOf(
          HeadObjectCommand,
        );
      },
    );

    it(
      "rejects authoritative HEAD Content-Type mismatch before GET",
      async () => {
        mocks.send.mockResolvedValueOnce(
          {
            ContentLength: 100,
            ContentType:
              "image/png",
          },
        );

        await expect(
          loadProfileMediaStagingObject(
            {
              objectKey:
                "staging/profile/test/mismatch",
              expectedContentType:
                "image/jpeg",
            },
          ),
        ).rejects.toThrow();

        expect(
          mocks.send,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "rejects GET Content-Type that disagrees with the authoritative intent",
      async () => {
        const sourceBytes =
          Buffer.from([
            1,
            2,
            3,
          ]);

        mocks.send.mockImplementation(
          async (
            command: unknown,
          ) => {
            if (
              command instanceof
              HeadObjectCommand
            ) {
              return {
                ContentLength: 3,
                ContentType:
                  "image/png",
              };
            }

            if (
              command instanceof
              GetObjectCommand
            ) {
              return {
                ContentLength: 3,
                ContentType:
                  "image/jpeg",
                Body:
                  createMockBody(
                    sourceBytes,
                  ),
              };
            }

            throw new Error(
              "Unexpected command.",
            );
          },
        );

        await expect(
          loadProfileMediaStagingObject(
            {
              objectKey:
                "staging/profile/test/get-mismatch",
              expectedContentType:
                "image/png",
            },
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects downloaded bytes whose length disagrees with authoritative object metadata",
      async () => {
        const actualBytes =
          Buffer.from([
            1,
            2,
          ]);

        mocks.send.mockImplementation(
          async (
            command: unknown,
          ) => {
            if (
              command instanceof
              HeadObjectCommand
            ) {
              return {
                ContentLength: 3,
                ContentType:
                  "image/webp",
              };
            }

            if (
              command instanceof
              GetObjectCommand
            ) {
              return {
                ContentLength: 3,
                ContentType:
                  "image/webp",
                Body:
                  createMockBody(
                    actualBytes,
                  ),
              };
            }

            throw new Error(
              "Unexpected command.",
            );
          },
        );

        await expect(
          loadProfileMediaStagingObject(
            {
              objectKey:
                "staging/profile/test/truncated",
              expectedContentType:
                "image/webp",
            },
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "creates canonical media with immutable conditional PutObject semantics",
      async () => {
        const canonicalBytes =
          Buffer.from([
            10,
            20,
            30,
            40,
          ]);

        mocks.send.mockResolvedValue(
          {},
        );

        const objectKey =
          "working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp";

        await putCanonicalProfileMediaObject(
          {
            objectKey,
            bytes:
              canonicalBytes,
          },
        );

        expect(
          mocks.send,
        ).toHaveBeenCalledTimes(1);

        const command =
          mocks.send.mock
            .calls[0]?.[0];

        expect(
          command,
        ).toBeInstanceOf(
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
          canonicalBytes.byteLength,
        );

        expect(
          input.IfNoneMatch,
        ).toBe("*");

        expect(
          Buffer.compare(
            Buffer.from(
              input.Body as
                Uint8Array,
            ),
            canonicalBytes,
          ),
        ).toBe(0);
      },
    );

    it(
      "rejects empty canonical bytes before PutObject",
      async () => {
        await expect(
          putCanonicalProfileMediaObject(
            {
              objectKey:
                "working/profile/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp",
              bytes:
                Buffer.alloc(0),
            },
          ),
        ).rejects.toThrow();

        expect(
          mocks.send,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "treats staging deletion failure as best-effort cleanup",
      async () => {
        mocks.send.mockRejectedValue(
          new Error(
            "Simulated R2 delete failure.",
          ),
        );

        await expect(
          deleteProfileMediaStagingObjectBestEffort(
            "staging/profile/test/delete",
          ),
        ).resolves.toBeUndefined();

        expect(
          mocks.send,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.send.mock.calls[0]?.[0],
        ).toBeInstanceOf(
          DeleteObjectCommand,
        );
      },
    );
  },
);