import sharp from "sharp";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  sanitizeMedia,
  MediaSanitizerProcessingError,
} from "./processor";

const MALICIOUS_MARKER =
  "SPALL_SPILL_ACTIVE_PAYLOAD_SENTINEL";

async function expectRejected(
  bytes: Buffer,
  contentType:
    | "image/jpeg"
    | "image/png"
    | "image/webp",
): Promise<void> {
  await expect(
    sanitizeMedia({
      bytes,
      expectedContentType:
        contentType,
    }),
  ).rejects.toBeInstanceOf(
    MediaSanitizerProcessingError,
  );
}

async function createFixture(
  format:
    | "jpeg"
    | "png"
    | "webp",
): Promise<Buffer> {
  const image =
    sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: {
          r: 25,
          g: 50,
          b: 75,
        },
      },
    });

  switch (format) {
    case "jpeg":
      return image
        .jpeg()
        .toBuffer();

    case "png":
      return image
        .png()
        .toBuffer();

    case "webp":
      return image
        .webp()
        .toBuffer();
  }
}

describe(
  "Profile Media adversarial canonicalization",
  () => {
    it.each([
      [
        "HTML",
        Buffer.from(
          `<!doctype html><script>${MALICIOUS_MARKER}</script>`,
        ),
      ],
      [
        "SVG",
        Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" onload="alert('${MALICIOUS_MARKER}')"></svg>`,
        ),
      ],
    ])(
      "rejects %s disguised as a supported image before native decode",
      async (_label, bytes) => {
        await expectRejected(
          bytes,
          "image/png",
        );
      },
    );

    it.each([
      [
        "jpeg",
        "image/jpeg",
      ],
      [
        "png",
        "image/png",
      ],
      [
        "webp",
        "image/webp",
      ],
    ] as const)(
      "rejects valid %s with a trailing polyglot/script payload",
      async (
        format,
        contentType,
      ) => {
        const valid =
          await createFixture(
            format,
          );

        const polyglot =
          Buffer.concat([
            valid,
            Buffer.from(
              `<script>${MALICIOUS_MARKER}</script>`,
            ),
          ]);

        await expectRejected(
          polyglot,
          contentType,
        );
      },
    );

    it(
      "strips active-looking XMP metadata instead of copying it into canonical output",
      async () => {
        const maliciousXmp = `
          <?xml version="1.0"?>
          <x:xmpmeta xmlns:x="adobe:ns:meta/">
            <script>${MALICIOUS_MARKER}</script>
          </x:xmpmeta>
        `;

        const source =
          await sharp({
            create: {
              width: 80,
              height: 40,
              channels: 3,
              background: {
                r: 90,
                g: 45,
                b: 135,
              },
            },
          })
            .jpeg()
            .withXmp(
              maliciousXmp,
            )
            .toBuffer();

        expect(
          source.includes(
            Buffer.from(
              MALICIOUS_MARKER,
            ),
          ),
        ).toBe(true);

        const result =
          await sanitizeMedia({
            bytes: source,
            expectedContentType:
              "image/jpeg",
          });

        expect(
          result.bytes.includes(
            Buffer.from(
              MALICIOUS_MARKER,
            ),
          ),
        ).toBe(false);

        const metadata =
          await sharp(
            result.bytes,
          ).metadata();

        expect(
          metadata.xmp,
        ).toBeUndefined();

        expect(
          metadata.exif,
        ).toBeUndefined();
      },
    );

    it(
      "produces a strict self-consistent WebP container",
      async () => {
        const source =
          await createFixture(
            "png",
          );

        const result =
          await sanitizeMedia({
            bytes: source,
            expectedContentType:
              "image/png",
          });

        expect(
          result.bytes
            .subarray(0, 4)
            .toString("ascii"),
        ).toBe("RIFF");

        expect(
          result.bytes
            .subarray(8, 12)
            .toString("ascii"),
        ).toBe("WEBP");

        expect(
          result.bytes.readUInt32LE(
            4,
          ) + 8,
        ).toBe(
          result.bytes.byteLength,
        );

        expect(
          result.contentType,
        ).toBe("image/webp");
      },
    );
  },
);