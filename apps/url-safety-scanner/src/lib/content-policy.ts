import {
  parse,
} from "parse5";

import type {
  PinnedDocument,
} from "./pinned-transport";

export type ContentPolicyStatus =
  | "clear"
  | "review"
  | "blocked";

export type ContentPolicyVerdict =
  Readonly<{
    status:
      ContentPolicyStatus;

    reasonCodes:
      readonly string[];

    extractedTextLength:
      number;
  }>;

const MAX_CLASSIFICATION_TEXT_CHARS =
  64_000;

const SKIPPED_HTML_ELEMENTS =
  new Set([
    "script",
    "style",
    "template",
    "noscript",
  ]);

const WHITESPACE =
  /\s+/g;

const BASIC_ENTITIES:
  Readonly<
    Record<
      string,
      string
    >
  > = {
    "&amp;":
      "&",
    "&lt;":
      "<",
    "&gt;":
      ">",
    "&quot;":
      '"',
    "&#39;":
      "'",
    "&nbsp;":
      " ",
  };

const HARD_GAMBLING_PATTERNS =
  [
    /\bslot\s+gacor\b/i,
    /\bjudi\s+online\b/i,
    /\bsitus\s+judi\b/i,
    /\bbandar\s+togel\b/i,
    /\btogel\s+online\b/i,
    /\bcasino\s+online\b/i,
    /\bagen\s+slot\b/i,
    /\bdeposit\s+slot\b/i,
    /\bjackpot\s+slot\b/i,
  ] as const;

const HARD_ADULT_PATTERNS =
  [
    /\bbokep\b/i,
    /\bporn(?:ografi|ography)?\b/i,
    /\bvideo\s+porno\b/i,
    /\bvideo\s+seks\b/i,
    /\bsex\s+video\b/i,
    /\badult\s+video\b/i,
    /\bxxx\s+video\b/i,
    /\bnude\s+video\b/i,
  ] as const;

const SCAM_REVIEW_PATTERNS =
  [
    /\bkirim\s+(?:kode\s+)?otp\b/i,
    /\bberikan\s+(?:kode\s+)?otp\b/i,
    /\bmasukkan\s+(?:kode\s+)?otp\b/i,
    /\bseed\s+phrase\b/i,
    /\brecovery\s+phrase\b/i,
    /\bprivate\s+key\b/i,
    /\btransfer\s+sekarang\b/i,
    /\bclaim\s+hadiah\b/i,
    /\bklaim\s+hadiah\b/i,
    /\bkeuntungan\s+dijamin\b/i,
    /\bguaranteed\s+profit\b/i,
    /\bdouble\s+your\s+money\b/i,
  ] as const;

const ABUSE_REVIEW_PATTERNS =
  [
    /\bkill\s+yourself\b/i,
    /\bgo\s+die\b/i,
    /\bmati\s+aja\b/i,
    /\bbunuh\s+diri\s+aja\b/i,
  ] as const;

const GAMBLING_REVIEW_PATTERNS =
  [
    /\bslot\b/i,
    /\btogel\b/i,
    /\bcasino\b/i,
    /\bbetting\b/i,
    /\bparlay\b/i,
  ] as const;

const ADULT_REVIEW_PATTERNS =
  [
    /\badult\b/i,
    /\bnude\b/i,
    /\bseks\b/i,
    /\bsex\b/i,
  ] as const;

type ParsedHtmlNode =
  Readonly<{
    nodeName?:
      unknown;

    value?:
      unknown;

    childNodes?:
      unknown;
  }>;

function extractParsedHtmlText(
  value: string,
): string {
  /*
   * parse5 follows the HTML5 parsing model
   * instead of attempting to understand markup
   * with regular expressions.
   *
   * The fetched document is already bounded by
   * the pinned transport layer, so constructing
   * this DOM remains resource-bounded.
   */
  const document =
    parse(
      value,
    );

  const parts:
    string[] = [];

  const stack:
    unknown[] = [
      document,
    ];

  while (
    stack.length > 0
  ) {
    const current =
      stack.pop();

    if (
      typeof current !==
        "object" ||
      current === null ||
      Array.isArray(
        current,
      )
    ) {
      continue;
    }

    const node =
      current as
        ParsedHtmlNode;

    const nodeName =
      typeof node.nodeName ===
        "string"
        ? node.nodeName
            .toLowerCase()
        : "";

    /*
     * These elements do not contribute trusted
     * visible classification text.
     *
     * Skipping the node also skips its entire
     * descendant subtree.
     */
    if (
      SKIPPED_HTML_ELEMENTS
        .has(
          nodeName,
        ) ||
      nodeName ===
        "#comment"
    ) {
      continue;
    }

    if (
      nodeName ===
        "#text"
    ) {
      if (
        typeof node.value ===
          "string" &&
        node.value.length >
          0
      ) {
        parts.push(
          node.value,
        );
      }

      continue;
    }

    if (
      Array.isArray(
        node.childNodes,
      )
    ) {
      /*
       * Push in reverse so traversal preserves
       * original document order.
       */
      for (
        let index =
          node.childNodes.length -
          1;
        index >= 0;
        index -= 1
      ) {
        stack.push(
          node.childNodes[
            index
          ],
        );
      }
    }
  }

  /*
   * Explicit separators prevent markup/comment
   * boundaries from being used to hide phrases
   * such as slot<!-- -->gacor.
   */
  return parts.join(
    " ",
  );
}

function decodeBasicEntities(
  value: string,
): string {
  let decoded =
    value;

  for (
    const [
      entity,
      replacement,
    ] of Object.entries(
      BASIC_ENTITIES,
    )
  ) {
    decoded =
      decoded.replaceAll(
        entity,
        replacement,
      );
  }

  decoded =
    decoded.replace(
      /&#(\d{1,7});/g,
      (
        _match,
        decimal:
          string,
      ) => {
        const codePoint =
          Number(
            decimal,
          );

        if (
          !Number.isInteger(
            codePoint,
          ) ||
          codePoint < 0 ||
          codePoint >
            0x10ffff
        ) {
          return " ";
        }

        try {
          return String
            .fromCodePoint(
              codePoint,
            );
        } catch {
          return " ";
        }
      },
    );

  decoded =
    decoded.replace(
      /&#x([0-9a-f]{1,6});/gi,
      (
        _match,
        hexadecimal:
          string,
      ) => {
        const codePoint =
          Number.parseInt(
            hexadecimal,
            16,
          );

        if (
          !Number.isInteger(
            codePoint,
          ) ||
          codePoint < 0 ||
          codePoint >
            0x10ffff
        ) {
          return " ";
        }

        try {
          return String
            .fromCodePoint(
              codePoint,
            );
        } catch {
          return " ";
        }
      },
    );

  return decoded;
}

export function extractInspectableText(
  document:
    Pick<
      PinnedDocument,
      "contentType" | "text"
    >,
): string {
  const isHtml =
    document.contentType ===
      "text/html" ||
    document.contentType ===
      "application/xhtml+xml";

  /*
   * parse5 already performs HTML character
   * reference decoding for parsed text nodes.
   *
   * Plain text keeps the explicit entity decoder
   * for the existing conservative behavior.
   */
  let text =
    isHtml
      ? extractParsedHtmlText(
          document.text,
        )
      : decodeBasicEntities(
          document.text,
        );

  text =
    text
      .normalize("NFKC")
      .replace(
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
        " ",
      )
      .replace(
        WHITESPACE,
        " ",
      )
      .trim();

  if (
    text.length >
      MAX_CLASSIFICATION_TEXT_CHARS
  ) {
    return text.slice(
      0,
      MAX_CLASSIFICATION_TEXT_CHARS,
    );
  }

  return text;
}

function matchesAny(
  text: string,
  patterns:
    readonly RegExp[],
): boolean {
  return patterns.some(
    (pattern) =>
      pattern.test(
        text,
      ),
  );
}

export function classifyDestinationContent(
  document:
    Pick<
      PinnedDocument,
      "contentType" | "text"
    >,
): ContentPolicyVerdict {
  const text =
    extractInspectableText(
      document,
    );

  if (
    matchesAny(
      text,
      HARD_GAMBLING_PATTERNS,
    )
  ) {
    return {
      status:
        "blocked",

      reasonCodes: [
        "content:gambling",
      ],

      extractedTextLength:
        text.length,
    };
  }

  if (
    matchesAny(
      text,
      HARD_ADULT_PATTERNS,
    )
  ) {
    return {
      status:
        "blocked",

      reasonCodes: [
        "content:adult",
      ],

      extractedTextLength:
        text.length,
    };
  }

  const reviewReasons:
    string[] = [];

  if (
    matchesAny(
      text,
      SCAM_REVIEW_PATTERNS,
    )
  ) {
    reviewReasons.push(
      "content:scam_signal",
    );
  }

  if (
    matchesAny(
      text,
      ABUSE_REVIEW_PATTERNS,
    )
  ) {
    reviewReasons.push(
      "content:abusive_signal",
    );
  }

  if (
    matchesAny(
      text,
      GAMBLING_REVIEW_PATTERNS,
    )
  ) {
    reviewReasons.push(
      "content:gambling_ambiguous",
    );
  }

  if (
    matchesAny(
      text,
      ADULT_REVIEW_PATTERNS,
    )
  ) {
    reviewReasons.push(
      "content:adult_ambiguous",
    );
  }

  if (
    reviewReasons.length > 0
  ) {
    return {
      status:
        "review",

      reasonCodes: [
        ...new Set(
          reviewReasons,
        ),
      ],

      extractedTextLength:
        text.length,
    };
  }

  return {
    status:
      "clear",

    reasonCodes: [],

    extractedTextLength:
      text.length,
  };
}