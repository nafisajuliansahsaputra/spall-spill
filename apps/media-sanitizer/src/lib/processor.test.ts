import sharp from "sharp";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
  PROFILE_MEDIA_MAX_CANONICAL_DIMENSION,
  PROFILE_MEDIA_MAX_SOURCE_BYTES,
  PROFILE_MEDIA_MAX_SOURCE_DIMENSION,
  type ProfileMediaSourceContentType,
} from "@spall-spill/profile-media-policy";
import {
  sanitizeMedia,
  MediaSanitizerProcessingError,
} from "./processor";

type FixtureFormat =
  | "jpeg"
  | "png"
  | "webp";

const FIXTURE_CONTENT_TYPES:
  Readonly<
    Record<
      FixtureFormat,
      ProfileMediaSourceContentType
    >
  > = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };

const TEST_XMP = `<?xml version="1.0"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description
      rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
    >
      <dc:creator>
        <rdf:Seq>
          <rdf:li>Spall Spill security fixture</rdf:li>
        </rdf:Seq>
      </dc:creator>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

async function createStaticFixture(
  format: FixtureFormat,
  width = 320,
  height = 180,
): Promise<Buffer> {
  const image =
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: {
          r: 42,
          g: 96,
          b: 144,
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

async function expectProcessingFailure(
  operation: Promise<unknown>,
): Promise<void> {
  await expect(
    operation,
  ).rejects.toBeInstanceOf(
    MediaSanitizerProcessingError,
  );
}

describe(
  "sanitizeMedia",
  () => {
    it.each(
      [
        "jpeg",
        "png",
        "webp",
      ] as const,
    )(
      "accepts a valid static %s source and canonicalizes it to static WebP",
      async (format) => {
        const source =
          await createStaticFixture(
            format,
          );

        const result =
          await sanitizeMedia(
            {
              bytes: source,
              expectedContentType:
                FIXTURE_CONTENT_TYPES[
                  format
                ],
            },
          );

        expect(
          result.contentType,
        ).toBe(
          PROFILE_MEDIA_CANONICAL_CONTENT_TYPE,
        );

        expect(
          result.byteSize,
        ).toBe(
          result.bytes.byteLength,
        );

        expect(
          result.width,
        ).toBe(320);

        expect(
          result.height,
        ).toBe(180);

        const metadata =
          await sharp(
            result.bytes,
            {
              animated: true,
            },
          ).metadata();

        expect(
          metadata.format,
        ).toBe("webp");

        expect(
          metadata.pages ?? 1,
        ).toBe(1);

        expect(
          metadata.width,
        ).toBe(320);

        expect(
          metadata.height,
        ).toBe(180);
      },
    );

    it(
      "rejects an empty source",
      async () => {
        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes:
                Buffer.alloc(0),
              expectedContentType:
                "image/jpeg",
            },
          ),
        );
      },
    );

    it(
      "rejects a source larger than the authoritative 5 MiB boundary before decode",
      async () => {
        const oversized =
          Buffer.alloc(
            PROFILE_MEDIA_MAX_SOURCE_BYTES +
              1,
          );

        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes: oversized,
              expectedContentType:
                "image/png",
            },
          ),
        );
      },
    );

    it(
      "rejects malformed bytes even when the declared MIME is supported",
      async () => {
        const malformed =
          Buffer.from(
            "this-is-not-an-image",
            "utf8",
          );

        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes: malformed,
              expectedContentType:
                "image/webp",
            },
          ),
        );
      },
    );

    it(
      "rejects MIME and decoded-format mismatch",
      async () => {
        const png =
          await createStaticFixture(
            "png",
          );

        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes: png,
              expectedContentType:
                "image/jpeg",
            },
          ),
        );
      },
    );

    it(
      "rejects an unsupported decoded source format even when transport MIME pretends to be supported",
      async () => {
        const avif =
          await sharp({
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: {
                r: 100,
                g: 80,
                b: 60,
              },
            },
          })
            .avif()
            .toBuffer();

        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes: avif,
              expectedContentType:
                "image/webp",
            },
          ),
        );
      },
    );

    it(
      "rejects an animated WebP rather than silently selecting one frame",
      async () => {
        const frameOne =
          await sharp({
            create: {
              width: 16,
              height: 16,
              channels: 4,
              background: {
                r: 255,
                g: 0,
                b: 0,
                alpha: 1,
              },
            },
          })
            .png()
            .toBuffer();

        const frameTwo =
          await sharp({
            create: {
              width: 16,
              height: 16,
              channels: 4,
              background: {
                r: 0,
                g: 0,
                b: 255,
                alpha: 1,
              },
            },
          })
            .png()
            .toBuffer();

        const animatedWebp =
          await sharp(
            [
              frameOne,
              frameTwo,
            ],
            {
              join: {
                animated: true,
              },
            },
          )
            .webp({
              loop: 0,
              delay: [
                100,
                100,
              ],
            })
            .toBuffer();

        const sourceMetadata =
          await sharp(
            animatedWebp,
            {
              animated: true,
            },
          ).metadata();

        expect(
          sourceMetadata.pages,
        ).toBe(2);

        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes:
                animatedWebp,
              expectedContentType:
                "image/webp",
            },
          ),
        );
      },
    );

    it(
      "rejects a decoded dimension above the 4096 source boundary",
      async () => {
        const oversizedDimension =
          await sharp({
            create: {
              width:
                PROFILE_MEDIA_MAX_SOURCE_DIMENSION +
                1,
              height: 32,
              channels: 3,
              background: {
                r: 20,
                g: 40,
                b: 60,
              },
            },
          })
            .png()
            .toBuffer();

        expect(
          oversizedDimension.byteLength,
        ).toBeLessThanOrEqual(
          PROFILE_MEDIA_MAX_SOURCE_BYTES,
        );

        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes:
                oversizedDimension,
              expectedContentType:
                "image/png",
            },
          ),
        );
      },
    );

    it(
      "enforces the decoded pixel ceiling before unsafe processing",
      async () => {
        const pixelBombBoundaryFixture =
          await sharp({
            create: {
              width:
                PROFILE_MEDIA_MAX_SOURCE_DIMENSION +
                1,
              height:
                PROFILE_MEDIA_MAX_SOURCE_DIMENSION +
                1,
              channels: 3,
              background: {
                r: 8,
                g: 16,
                b: 24,
              },
            },
          })
            .png({
              compressionLevel: 9,
            })
            .toBuffer();

        expect(
          pixelBombBoundaryFixture.byteLength,
        ).toBeLessThanOrEqual(
          PROFILE_MEDIA_MAX_SOURCE_BYTES,
        );

        await expectProcessingFailure(
          sanitizeMedia(
            {
              bytes:
                pixelBombBoundaryFixture,
              expectedContentType:
                "image/png",
            },
          ),
        );
      },
    );

    it(
      "normalizes EXIF orientation and strips EXIF and XMP metadata",
      async () => {
        const source =
          await sharp({
            create: {
              width: 120,
              height: 60,
              channels: 3,
              background: {
                r: 120,
                g: 90,
                b: 30,
              },
            },
          })
            .jpeg()
            .withMetadata({
              orientation: 6,
            })
            .withXmp(
              TEST_XMP,
            )
            .toBuffer();

        const sourceMetadata =
          await sharp(
            source,
          ).metadata();

        expect(
          sourceMetadata.orientation,
        ).toBe(6);

        expect(
          sourceMetadata.exif,
        ).toBeDefined();

        expect(
          sourceMetadata.xmp,
        ).toBeDefined();

        const result =
          await sanitizeMedia(
            {
              bytes: source,
              expectedContentType:
                "image/jpeg",
            },
          );

        expect(
          result.width,
        ).toBe(60);

        expect(
          result.height,
        ).toBe(120);

        const outputMetadata =
          await sharp(
            result.bytes,
          ).metadata();

        expect(
          outputMetadata.orientation,
        ).toBeUndefined();

        expect(
          outputMetadata.exif,
        ).toBeUndefined();

        expect(
          outputMetadata.xmp,
        ).toBeUndefined();
      },
    );

    it(
      "preserves source transparency in canonical WebP",
      async () => {
        const transparentPng =
          await sharp({
            create: {
              width: 80,
              height: 40,
              channels: 4,
              background: {
                r: 10,
                g: 80,
                b: 140,
                alpha: 0.35,
              },
            },
          })
            .png()
            .toBuffer();

        const result =
          await sanitizeMedia(
            {
              bytes:
                transparentPng,
              expectedContentType:
                "image/png",
            },
          );

        const metadata =
          await sharp(
            result.bytes,
          ).metadata();

        expect(
          metadata.format,
        ).toBe("webp");

        expect(
          metadata.hasAlpha,
        ).toBe(true);
      },
    );

    it(
      "constrains a large valid image inside 2048 without changing aspect ratio",
      async () => {
        const largeSource =
          await sharp({
            create: {
              width: 3000,
              height: 1500,
              channels: 3,
              background: {
                r: 180,
                g: 120,
                b: 60,
              },
            },
          })
            .png()
            .toBuffer();

        const result =
          await sanitizeMedia(
            {
              bytes:
                largeSource,
              expectedContentType:
                "image/png",
            },
          );

        expect(
          result.width,
        ).toBe(
          PROFILE_MEDIA_MAX_CANONICAL_DIMENSION,
        );

        expect(
          result.height,
        ).toBe(
          PROFILE_MEDIA_MAX_CANONICAL_DIMENSION /
            2,
        );
      },
    );

    it(
      "does not upscale a smaller valid source",
      async () => {
        const smallSource =
          await createStaticFixture(
            "jpeg",
            64,
            32,
          );

        const result =
          await sanitizeMedia(
            {
              bytes:
                smallSource,
              expectedContentType:
                "image/jpeg",
            },
          );

        expect(
          result.width,
        ).toBe(64);

        expect(
          result.height,
        ).toBe(32);
      },
    );
  },
);