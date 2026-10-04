import {
  EventEmitter,
} from "node:events";
import {
  PassThrough,
} from "node:stream";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks =
  vi.hoisted(() => ({
    httpsRequest:
      vi.fn(),
    httpRequest:
      vi.fn(),
  }));

vi.mock(
  "node:https",
  async (
    importOriginal,
  ) => {
    const actual =
      await importOriginal<
        typeof import("node:https")
      >();

    return {
      ...actual,
      request:
        mocks.httpsRequest,
    };
  },
);

vi.mock(
  "node:http",
  async (
    importOriginal,
  ) => {
    const actual =
      await importOriginal<
        typeof import("node:http")
      >();

    return {
      ...actual,
      request:
        mocks.httpRequest,
    };
  },
);

import {
  PINNED_DOCUMENT_MAX_BYTES,
  createPinnedRequestOptions,
  requestPinnedDocument,
  requestPinnedInspection,
} from "./pinned-transport";

function installHttpsResponse(
  input: Readonly<{
    statusCode?: number;
    headers?: Record<
      string,
      string
    >;
    chunks?: readonly Buffer[];
  }>,
): void {
  mocks.httpsRequest
    .mockImplementation(
      (
        _options,
        callback,
      ) => {
        const request =
          new EventEmitter() as
            EventEmitter & {
              end:
                () => void;
              destroy:
                (
                  error?:
                    Error,
                ) => void;
            };

        request.destroy =
          (error?: Error) => {
            if (error) {
              queueMicrotask(
                () =>
                  request.emit(
                    "error",
                    error,
                  ),
              );
            }
          };

        request.end =
          () => {
            const response =
              new PassThrough() as
                PassThrough & {
                  statusCode:
                    number;
                  headers:
                    Record<
                      string,
                      string
                    >;
                };

            response.statusCode =
              input.statusCode ??
              200;

            response.headers =
              input.headers ?? {
                "content-type":
                  "text/html; charset=utf-8",
              };

            callback(
              response,
            );

            for (
              const chunk
              of input.chunks ?? []
            ) {
              response.write(
                chunk,
              );
            }

            response.end();
          };

        return request;
      },
    );
}

describe(
  "bounded pinned document transport",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it(
      "requests identity encoding so compressed-content bombs are not accepted",
      () => {
        const options =
          createPinnedRequestOptions(
            "https://example.com/",
            {
              address:
                "93.184.216.34",
              family: 4,
            },
          );

        expect(
          options.headers,
        ).toMatchObject({
          "Accept-Encoding":
            "identity",
        });
      },
    );

    it(
      "reads a small HTML terminal document through the pinned address",
      async () => {
        const body =
          Buffer.from(
            "<html><body>hello</body></html>",
          );

        installHttpsResponse({
          headers: {
            "content-type":
              "text/html; charset=utf-8",

            "content-length":
              String(
                body.byteLength,
              ),
          },

          chunks: [
            body,
          ],
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).resolves.toEqual({
          statusCode:
            200,

          contentType:
            "text/html",

          byteSize:
            body.byteLength,

          text:
            "<html><body>hello</body></html>",
        });
      },
    );

    it(
      "returns terminal headers and bounded body from one pinned network response",
      async () => {
        const body =
          Buffer.from(
            "<html><body>single response</body></html>",
          );

        installHttpsResponse({
          headers: {
            "content-type":
              "text/html; charset=utf-8",

            "content-length":
              String(
                body.byteLength,
              ),
          },

          chunks: [
            body,
          ],
        });

        await expect(
          requestPinnedInspection(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).resolves.toEqual({
          kind:
            "document",

          headers: {
            statusCode:
              200,

            location:
              null,

            contentType:
              "text/html; charset=utf-8",

            contentLength:
              String(
                body.byteLength,
              ),
          },

          document: {
            statusCode:
              200,

            contentType:
              "text/html",

            byteSize:
              body.byteLength,

            text:
              "<html><body>single response</body></html>",
          },
        });

        expect(
          mocks.httpsRequest,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "returns redirect headers from one pinned response without a second terminal fetch",
      async () => {
        installHttpsResponse({
          statusCode:
            302,

          headers: {
            location:
              "https://example.com/next",
          },
        });

        await expect(
          requestPinnedInspection(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).resolves.toEqual({
          kind:
            "redirect",

          headers: {
            statusCode:
              302,

            location:
              "https://example.com/next",

            contentType:
              null,

            contentLength:
              null,
          },
        });

        expect(
          mocks.httpsRequest,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it.each([
      "application/octet-stream",
      "image/png",
      "application/pdf",
    ])(
      "rejects non-inspectable content type %s",
      async (
        contentType,
      ) => {
        installHttpsResponse({
          headers: {
            "content-type":
              contentType,
          },

          chunks: [
            Buffer.from(
              "payload",
            ),
          ],
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "non-inspectable content type",
        );
      },
    );

    it(
      "rejects missing Content-Type",
      async () => {
        installHttpsResponse({
          headers: {},

          chunks: [
            Buffer.from(
              "hello",
            ),
          ],
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "Content-Type",
        );
      },
    );

    it.each([
      "gzip",
      "br",
      "deflate",
      "gzip, br",
    ])(
      "rejects compressed or unsupported content encoding %s",
      async (
        encoding,
      ) => {
        installHttpsResponse({
          headers: {
            "content-type":
              "text/html",
            "content-encoding":
              encoding,
          },
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "content encoding",
        );
      },
    );

    it(
      "rejects a declared document larger than the inspection cap",
      async () => {
        installHttpsResponse({
          headers: {
            "content-type":
              "text/html",

            "content-length":
              String(
                PINNED_DOCUMENT_MAX_BYTES +
                  1,
              ),
          },
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "size limit",
        );
      },
    );

    it(
      "enforces the byte cap even without Content-Length",
      async () => {
        installHttpsResponse({
          headers: {
            "content-type":
              "text/plain",
          },

          chunks: [
            Buffer.alloc(
              PINNED_DOCUMENT_MAX_BYTES,
              0x61,
            ),
            Buffer.from(
              "x",
            ),
          ],
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "size limit",
        );
      },
    );

    it(
      "rejects a mismatch between declared and received size",
      async () => {
        installHttpsResponse({
          headers: {
            "content-type":
              "text/plain",
            "content-length":
              "20",
          },

          chunks: [
            Buffer.from(
              "short",
            ),
          ],
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "did not match Content-Length",
        );
      },
    );

    it(
      "rejects malformed UTF-8 rather than interpreting binary payloads as text",
      async () => {
        installHttpsResponse({
          headers: {
            "content-type":
              "text/plain",
          },

          chunks: [
            Buffer.from([
              0xc3,
              0x28,
            ]),
          ],
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "valid UTF-8",
        );
      },
    );

    it(
      "rejects a second-request redirect instead of following it",
      async () => {
        installHttpsResponse({
          statusCode:
            302,

          headers: {
            location:
              "http://169.254.169.254/",
          },
        });

        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "changed into a redirect",
        );
      },
    );

    it(
      "retries another validated address when connection fails before any HTTP response",
      async () => {
        installHttpsResponse({
          headers: {
            "content-type":
              "text/plain",
          },

          chunks: [
            Buffer.from(
              "second backend response",
            ),
          ],
        });

        mocks.httpsRequest
          .mockImplementationOnce(
            () => {
              const request =
                new EventEmitter() as
                  EventEmitter & {
                    end:
                      () => void;
                    destroy:
                      (
                        error?:
                          Error,
                      ) => void;
                  };

              request.destroy =
                (error?: Error) => {
                  if (error) {
                    queueMicrotask(
                      () =>
                        request.emit(
                          "error",
                          error,
                        ),
                    );
                  }
                };

              request.end =
                () => {
                  queueMicrotask(
                    () =>
                      request.emit(
                        "error",
                        new Error(
                          "connection failed before response",
                        ),
                      ),
                  );
                };

              return request;
            },
          );

        await expect(
          requestPinnedInspection(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
              {
                address:
                  "93.184.216.35",
                family: 4,
              },
            ],
          ),
        ).resolves.toMatchObject({
          kind:
            "document",

          document: {
            text:
              "second backend response",
          },
        });

        expect(
          mocks.httpsRequest,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );

    it(
      "never retries another backend address after an HTTP response has begun",
      async () => {
        mocks.httpsRequest
          .mockImplementation(
            (
              _options,
              callback,
            ) => {
              const request =
                new EventEmitter() as
                  EventEmitter & {
                    end:
                      () => void;
                    destroy:
                      (
                        error?:
                          Error,
                      ) => void;
                  };

              request.destroy =
                (error?: Error) => {
                  if (error) {
                    queueMicrotask(
                      () =>
                        request.emit(
                          "error",
                          error,
                        ),
                    );
                  }
                };

              request.end =
                () => {
                  const response =
                    new PassThrough() as
                      PassThrough & {
                        statusCode:
                          number;
                        headers:
                          Record<
                            string,
                            string
                          >;
                      };

                  response.statusCode =
                    200;

                  response.headers = {
                    "content-type":
                      "text/plain",
                  };

                  callback(
                    response,
                  );

                  /*
                   * Headers have already made this
                   * backend authoritative. An
                   * aborted body must now fail
                   * closed instead of trying a
                   * second validated address.
                   */
                  queueMicrotask(
                    () =>
                      response.emit(
                        "aborted",
                      ),
                  );
                };

              return request;
            },
          );

        await expect(
          requestPinnedInspection(
            "https://example.com/",
            [
              {
                address:
                  "93.184.216.34",
                family: 4,
              },
              {
                address:
                  "93.184.216.35",
                family: 4,
              },
            ],
          ),
        ).rejects.toThrow(
          "transfer was aborted",
        );

        expect(
          mocks.httpsRequest,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "requires at least one already-validated public address",
      async () => {
        await expect(
          requestPinnedDocument(
            "https://example.com/",
            [],
          ),
        ).rejects.toThrow(
          "at least one validated address",
        );
      },
    );
  },
);