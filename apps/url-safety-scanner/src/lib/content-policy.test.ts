import {
  describe,
  expect,
  it,
} from "vitest";

import {
  classifyDestinationContent,
  extractInspectableText,
} from "./content-policy";

describe(
  "destination content policy",
  () => {
    it(
      "extracts visible HTML text while dropping executable and non-visible blocks",
      () => {
        const text =
          extractInspectableText({
            contentType:
              "text/html",

            text: `
              <html>
                <head>
                  <style>
                    .x { content: "slot gacor"; }
                  </style>
                  <script>
                    const fake = "bokep";
                  </script>
                </head>
                <body>
                  Hello &amp; welcome
                  <template>
                    judi online
                  </template>
                  <noscript>
                    porn video
                  </noscript>
                </body>
              </html>
            `,
          });

        expect(text)
          .toBe(
            "Hello & welcome",
          );
      },
    );

    it(
      "does not classify dangerous text that exists only inside HTML attributes",
      () => {
        const result =
          classifyDestinationContent({
            contentType:
              "text/html",

            text: `
              <main
                data-description="> slot gacor judi online <"
              >
                Ordinary product recommendation page
              </main>
            `,
          });

        expect(
          result,
        ).toMatchObject({
          status:
            "clear",

          reasonCodes: [],
        });

        expect(
          extractInspectableText({
            contentType:
              "text/html",

            text: `
              <div title="slot gacor">
                Ordinary product
              </div>
            `,
          }),
        ).not.toContain(
          "slot gacor",
        );
      },
    );

    it(
      "detects dangerous visible text through malformed nested HTML",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/html",

            text:
              "<main><p>slot <strong>gacor</main>",
          }),
        ).toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:gambling",
          ],
        });
      },
    );

    it(
      "does not let HTML comments hide a dangerous visible phrase",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/html",

            text:
              "<p>slot<!-- attacker separator -->gacor</p>",
          }),
        ).toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:gambling",
          ],
        });
      },
    );

    it(
      "uses browser parsing when tag attributes contain misleading closing characters",
      () => {
        const text =
          extractInspectableText({
            contentType:
              "text/html",

            text:
              '<div data-value=">slot gacor<">Safe catalog page</div>',
          });

        expect(
          text,
        ).toBe(
          "Safe catalog page",
        );
      },
    );

    it(
      "keeps executable markup content excluded even when it contains fake visible HTML",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/html",

            text: `
              <script>
                document.write(
                  "<p>slot gacor</p>"
                );
              </script>

              <style>
                body::after {
                  content: "bokep";
                }
              </style>

              <main>
                Ordinary recommendation page
              </main>
            `,
          }),
        ).toMatchObject({
          status:
            "clear",

          reasonCodes: [],
        });
      },
    );

    it(
      "lets the HTML parser decode numeric entities before policy matching",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/html",

            text:
              "<p>&#115;&#108;&#111;&#116; &#103;&#97;&#99;&#111;&#114;</p>",
          }),
        ).toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:gambling",
          ],
        });
      },
    );

    it(
      "normalizes Unicode compatibility characters",
      () => {
        const text =
          extractInspectableText({
            contentType:
              "text/plain",

            text:
              "ＳＬＯＴ　ＧＡＣＯＲ",
          });

        expect(text)
          .toBe(
            "SLOT GACOR",
          );
      },
    );

    it.each([
      "slot gacor maxwin hari ini",
      "situs judi online terpercaya",
      "bandar togel online",
      "casino online deposit cepat",
      "agen slot jackpot terbesar",
    ])(
      "hard-blocks explicit gambling content: %s",
      (text) => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/plain",
            text,
          }),
        ).toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:gambling",
          ],
        });
      },
    );

    it.each([
      "nonton bokep terbaru",
      "video porno gratis",
      "adult video collection",
      "xxx video download",
      "nude video archive",
    ])(
      "hard-blocks explicit adult content: %s",
      (text) => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/plain",
            text,
          }),
        ).toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:adult",
          ],
        });
      },
    );

    it.each([
      "berikan kode otp untuk verifikasi",
      "kirim OTP sekarang",
      "verify your seed phrase",
      "enter your private key",
      "keuntungan dijamin setiap hari",
      "guaranteed profit today",
      "double your money instantly",
    ])(
      "routes scam-like content to review: %s",
      (text) => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/plain",
            text,
          }),
        ).toMatchObject({
          status:
            "review",

          reasonCodes: [
            "content:scam_signal",
          ],
        });
      },
    );

    it.each([
      "kill yourself",
      "go die",
      "mati aja sana",
      "bunuh diri aja",
    ])(
      "routes explicit abusive content to review: %s",
      (text) => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/plain",
            text,
          }),
        ).toMatchObject({
          status:
            "review",

          reasonCodes: [
            "content:abusive_signal",
          ],
        });
      },
    );

    it.each([
      [
        "slot machine history",
        "content:gambling_ambiguous",
      ],
      [
        "casino architecture",
        "content:gambling_ambiguous",
      ],
      [
        "adult education resources",
        "content:adult_ambiguous",
      ],
      [
        "sex education for parents",
        "content:adult_ambiguous",
      ],
    ])(
      "uses review instead of hard block for ambiguous phrase: %s",
      (
        text,
        reason,
      ) => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/plain",
            text,
          }),
        ).toMatchObject({
          status:
            "review",

          reasonCodes: [
            reason,
          ],
        });
      },
    );

    it(
      "does not let dangerous words hidden only in script trigger a block",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/html",

            text: `
              <script>
                const fixture =
                  "slot gacor bokep";
              </script>

              <main>
                Product recommendation page
              </main>
            `,
          }),
        ).toMatchObject({
          status:
            "clear",
          reasonCodes: [],
        });
      },
    );

    it(
      "detects dangerous visible text even when split across HTML tags",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/html",

            text:
              "<p>slot</p><strong>gacor</strong>",
          }),
        ).toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:gambling",
          ],
        });
      },
    );

    it(
      "decodes numeric entities before classification",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/html",

            text:
              "<p>slot &#103;&#97;&#99;&#111;&#114;</p>",
          }),
        ).toMatchObject({
          status:
            "blocked",

          reasonCodes: [
            "content:gambling",
          ],
        });
      },
    );

    it(
      "returns clear for ordinary recommendation content",
      () => {
        expect(
          classifyDestinationContent({
            contentType:
              "text/plain",

            text:
              "Recommended running shoes with product details and marketplace destination.",
          }),
        ).toEqual({
          status:
            "clear",

          reasonCodes: [],

          extractedTextLength:
            75,
        });
      },
    );

    it(
      "deduplicates multiple review reasons of the same class",
      () => {
        const result =
          classifyDestinationContent({
            contentType:
              "text/plain",

            text:
              "slot betting parlay",
          });

        expect(result.status)
          .toBe(
            "review",
          );

        expect(
          result.reasonCodes,
        ).toEqual([
          "content:gambling_ambiguous",
        ]);
      },
    );
  },
);