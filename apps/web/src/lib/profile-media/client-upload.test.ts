import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  PROFILE_MEDIA_MAX_SOURCE_BYTES,
} from "@/lib/profile-media/contracts";
import {
  uploadProfileMediaFile,
} from "@/lib/profile-media/client-upload";

const INTENT_ID =
  "11111111-1111-4111-8111-111111111111";

const ASSET_KEY =
  "22222222-2222-4222-8222-222222222222";

function createFile(
  type = "image/png",
  size = 4,
): File {
  return new File(
    [
      new Uint8Array(size),
    ],
    "profile.png",
    {
      type,
    },
  );
}

function createSuccessfulInitiation() {
  return {
    status: "success" as const,
    uploadIntentId:
      INTENT_ID,
    uploadUrl:
      "https://example.invalid/signed-put",
    expectedContentType:
      "image/png" as const,
    requiredHeaders: {
      "Content-Type":
        "image/png" as const,
    },
    expiresAt:
      "2026-09-01T12:00:00.000Z",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe(
  "uploadProfileMediaFile",
  () => {
    it(
      "rejects unsupported MIME before creating an upload intent",
      async () => {
        const initiate = vi.fn();
        const finalize = vi.fn();

        const result =
          await uploadProfileMediaFile(
            {
              file: createFile(
                "image/gif",
              ),
              initiate,
              finalize,
              sleep:
                async () => {},
            },
          );

        expect(result).toEqual({
          status: "invalid_file",
          reason:
            "unsupported_type",
        });

        expect(
          initiate,
        ).not.toHaveBeenCalled();

        expect(
          finalize,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a source above 5 MiB before creating an upload intent",
      async () => {
        const initiate = vi.fn();
        const finalize = vi.fn();

        const result =
          await uploadProfileMediaFile(
            {
              file: createFile(
                "image/png",
                PROFILE_MEDIA_MAX_SOURCE_BYTES +
                  1,
              ),
              initiate,
              finalize,
              sleep:
                async () => {},
            },
          );

        expect(result).toEqual({
          status: "invalid_file",
          reason: "invalid_size",
        });

        expect(
          initiate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "uploads only to the issued signed URL and then finalizes the same intent",
      async () => {
        const phases: string[] = [];

        const initiate =
          vi.fn().mockResolvedValue(
            createSuccessfulInitiation(),
          );

        const finalize =
          vi.fn().mockResolvedValue({
            status:
              "success" as const,
            assetKey:
              ASSET_KEY,
            contentType:
              "image/webp" as const,
            byteSize: 1000,
            width: 512,
            height: 256,
            idempotent: false,
          });

        const fetchMock =
          vi
            .spyOn(
              globalThis,
              "fetch",
            )
            .mockResolvedValue(
              {
                ok: true,
              } as Response,
            );

        const file =
          createFile();

        const result =
          await uploadProfileMediaFile(
            {
              file,
              initiate,
              finalize,
              onPhase: (phase) => {
                phases.push(phase);
              },
              sleep:
                async () => {},
            },
          );

        expect(
          initiate,
        ).toHaveBeenCalledWith({
          contentType:
            "image/png",
          declaredByteSize:
            file.size,
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          fetchMock,
        ).toHaveBeenCalledWith(
          "https://example.invalid/signed-put",
          {
            method: "PUT",
            headers: {
              "Content-Type":
                "image/png",
            },
            body: file,
            credentials: "omit",
            redirect: "error",
            referrerPolicy:
              "no-referrer",
          },
        );

        expect(
          finalize,
        ).toHaveBeenCalledWith(
          INTENT_ID,
        );

        expect(phases).toEqual([
          "uploading",
          "processing",
        ]);

        expect(result).toEqual({
          status: "success",
          assetKey:
            ASSET_KEY,
          byteSize: 1000,
          width: 512,
          height: 256,
          idempotent: false,
        });
      },
    );

    it(
      "does not finalize when the R2 PUT is rejected",
      async () => {
        const initiate =
          vi.fn().mockResolvedValue(
            createSuccessfulInitiation(),
          );

        const finalize = vi.fn();

        vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValue(
            {
              ok: false,
            } as Response,
          );

        const result =
          await uploadProfileMediaFile(
            {
              file: createFile(),
              initiate,
              finalize,
              sleep:
                async () => {},
            },
          );

        expect(result).toEqual({
          status: "upload_failed",
        });

        expect(
          finalize,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not finalize when the browser PUT transport fails",
      async () => {
        const initiate =
          vi.fn().mockResolvedValue(
            createSuccessfulInitiation(),
          );

        const finalize = vi.fn();

        vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockRejectedValue(
            new Error(
              "Simulated CORS failure.",
            ),
          );

        const result =
          await uploadProfileMediaFile(
            {
              file: createFile(),
              initiate,
              finalize,
              sleep:
                async () => {},
            },
          );

        expect(result).toEqual({
          status: "upload_failed",
        });

        expect(
          finalize,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "recovers a duplicate finalize through the same intent after processing completes",
      async () => {
        const initiate =
          vi.fn().mockResolvedValue(
            createSuccessfulInitiation(),
          );

        const finalize =
          vi
            .fn()
            .mockResolvedValueOnce({
              status:
                "processing" as const,
            })
            .mockResolvedValueOnce({
              status:
                "success" as const,
              assetKey:
                ASSET_KEY,
              contentType:
                "image/webp" as const,
              byteSize: 900,
              width: 300,
              height: 300,
              idempotent: true,
            });

        const sleep = vi.fn(
          async () => {},
        );

        vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValue(
            {
              ok: true,
            } as Response,
          );

        const result =
          await uploadProfileMediaFile(
            {
              file: createFile(),
              initiate,
              finalize,
              sleep,
            },
          );

        expect(
          finalize,
        ).toHaveBeenCalledTimes(2);

        expect(
          finalize,
        ).toHaveBeenNthCalledWith(
          1,
          INTENT_ID,
        );

        expect(
          finalize,
        ).toHaveBeenNthCalledWith(
          2,
          INTENT_ID,
        );

        expect(
          sleep,
        ).toHaveBeenCalledTimes(1);

        expect(result).toEqual({
          status: "success",
          assetKey:
            ASSET_KEY,
          byteSize: 900,
          width: 300,
          height: 300,
          idempotent: true,
        });
      },
    );

    it(
      "retries the same intent after a lost finalization response",
      async () => {
        const initiate =
          vi.fn().mockResolvedValue(
            createSuccessfulInitiation(),
          );

        const finalize =
          vi
            .fn()
            .mockRejectedValueOnce(
              new Error(
                "Simulated lost response.",
              ),
            )
            .mockResolvedValueOnce({
              status:
                "success" as const,
              assetKey:
                ASSET_KEY,
              contentType:
                "image/webp" as const,
              byteSize: 800,
              width: 200,
              height: 200,
              idempotent: true,
            });

        vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValue(
            {
              ok: true,
            } as Response,
          );

        const result =
          await uploadProfileMediaFile(
            {
              file: createFile(),
              initiate,
              finalize,
              sleep:
                async () => {},
            },
          );

        expect(
          finalize,
        ).toHaveBeenCalledTimes(2);

        expect(result).toEqual({
          status: "success",
          assetKey:
            ASSET_KEY,
          byteSize: 800,
          width: 200,
          height: 200,
          idempotent: true,
        });
      },
    );

    it(
      "surfaces authoritative expiry without creating another upload intent",
      async () => {
        const initiate =
          vi.fn().mockResolvedValue(
            createSuccessfulInitiation(),
          );

        const finalize =
          vi.fn().mockResolvedValue({
            status:
              "expired" as const,
          });

        vi
          .spyOn(
            globalThis,
            "fetch",
          )
          .mockResolvedValue(
            {
              ok: true,
            } as Response,
          );

        const result =
          await uploadProfileMediaFile(
            {
              file: createFile(),
              initiate,
              finalize,
              sleep:
                async () => {},
            },
          );

        expect(result).toEqual({
          status:
            "finalization_failed",
          reason: "expired",
        });

        expect(
          initiate,
        ).toHaveBeenCalledTimes(1);
      },
    );
  },
);