import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  sanitizeProfileMediaStagingObject,
} from "./sanitizer-client";

const ORIGINAL_ENV = {
  MEDIA_SANITIZER_URL:
    process.env
      .MEDIA_SANITIZER_URL,

  MEDIA_SANITIZER_SHARED_SECRET:
    process.env
      .MEDIA_SANITIZER_SHARED_SECRET,
};

function createWebpFixture():
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

function createSuccessResponse():
  Response {
  const bytes =
    createWebpFixture();

  return new Response(
    new Uint8Array(bytes),
    {
      status: 200,

      headers: {
        "Content-Type":
          "image/webp",

        "Content-Length":
          String(
            bytes.byteLength,
          ),

        "X-Spall-Media-Width":
          "1",

        "X-Spall-Media-Height":
          "1",
      },
    },
  );
}

describe(
  "isolated Profile Media sanitizer client",
  () => {
    beforeEach(() => {
      process.env
        .MEDIA_SANITIZER_URL =
        "http://127.0.0.1:3001";

      process.env
        .MEDIA_SANITIZER_SHARED_SECRET =
        "0123456789abcdef0123456789abcdef";

      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            createSuccessResponse(),
        ),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();

      if (
        ORIGINAL_ENV
          .MEDIA_SANITIZER_URL ===
        undefined
      ) {
        delete process.env
          .MEDIA_SANITIZER_URL;
      } else {
        process.env
          .MEDIA_SANITIZER_URL =
          ORIGINAL_ENV
            .MEDIA_SANITIZER_URL;
      }

      if (
        ORIGINAL_ENV
          .MEDIA_SANITIZER_SHARED_SECRET ===
        undefined
      ) {
        delete process.env
          .MEDIA_SANITIZER_SHARED_SECRET;
      } else {
        process.env
          .MEDIA_SANITIZER_SHARED_SECRET =
          ORIGINAL_ENV
            .MEDIA_SANITIZER_SHARED_SECRET;
      }
    });

    it(
      "accepts only validated canonical WebP output",
      async () => {
        const result =
          await sanitizeProfileMediaStagingObject(
            {
              sourceUrl:
                "https://bucket.example.test/object?sig=test",

              expectedContentType:
                "image/png",

              expectedByteSize:
                123,
            },
          );

        expect(
          result.contentType,
        ).toBe("image/webp");

        expect(
          result.byteSize,
        ).toBe(12);

        expect(
          result.width,
        ).toBe(1);

        expect(
          result.height,
        ).toBe(1);

        const fetchMock =
          vi.mocked(fetch);

        expect(fetchMock)
          .toHaveBeenCalledTimes(
            1,
          );

        const call =
          fetchMock.mock
            .calls[0];

        const requestInit =
          call?.[1];

        expect(
          requestInit?.redirect,
        ).toBe("error");

        const headers =
          requestInit
            ?.headers as
            Record<
              string,
              string
            >;

        expect(
          headers[
            "X-Spall-Signature"
          ],
        ).toMatch(
          /^[0-9a-f]{64}$/,
        );
      },
    );

    it(
      "fails closed when sanitizer rejects the source",
      async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(
                null,
                {
                  status: 422,
                },
              ),
          ),
        );

        await expect(
          sanitizeProfileMediaStagingObject(
            {
              sourceUrl:
                "https://bucket.example.test/object",

              expectedContentType:
                "image/jpeg",

              expectedByteSize:
                100,
            },
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects an unexpected response Content-Type",
      async () => {
        const bytes =
          createWebpFixture();

        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(
                new Uint8Array(
                  bytes,
                ),
                {
                  status: 200,

                  headers: {
                    "Content-Type":
                      "text/html",

                    "Content-Length":
                      "12",

                    "X-Spall-Media-Width":
                      "1",

                    "X-Spall-Media-Height":
                      "1",
                  },
                },
              ),
          ),
        );

        await expect(
          sanitizeProfileMediaStagingObject(
            {
              sourceUrl:
                "https://bucket.example.test/object",

              expectedContentType:
                "image/png",

              expectedByteSize:
                100,
            },
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects inconsistent canonical byte metadata",
      async () => {
        const bytes =
          createWebpFixture();

        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(
                new Uint8Array(
                  bytes,
                ),
                {
                  status: 200,

                  headers: {
                    "Content-Type":
                      "image/webp",

                    "Content-Length":
                      "13",

                    "X-Spall-Media-Width":
                      "1",

                    "X-Spall-Media-Height":
                      "1",
                  },
                },
              ),
          ),
        );

        await expect(
          sanitizeProfileMediaStagingObject(
            {
              sourceUrl:
                "https://bucket.example.test/object",

              expectedContentType:
                "image/png",

              expectedByteSize:
                100,
            },
          ),
        ).rejects.toThrow();
      },
    );

    it(
      "rejects malformed WebP returned by a compromised sanitizer",
      async () => {
        const bytes =
          Buffer.from(
            "not-a-webp!!",
            "ascii",
          );

        vi.stubGlobal(
          "fetch",
          vi.fn(
            async () =>
              new Response(
                new Uint8Array(
                  bytes,
                ),
                {
                  status: 200,

                  headers: {
                    "Content-Type":
                      "image/webp",

                    "Content-Length":
                      String(
                        bytes.byteLength,
                      ),

                    "X-Spall-Media-Width":
                      "1",

                    "X-Spall-Media-Height":
                      "1",
                  },
                },
              ),
          ),
        );

        await expect(
          sanitizeProfileMediaStagingObject(
            {
              sourceUrl:
                "https://bucket.example.test/object",

              expectedContentType:
                "image/webp",

              expectedByteSize:
                100,
            },
          ),
        ).rejects.toThrow();
      },
    );
  },
);