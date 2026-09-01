import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const sourceDirectory =
  fileURLToPath(
    new URL("./src/", import.meta.url),
  );

const serverOnlyTestShim =
  fileURLToPath(
    new URL(
      "./src/test/server-only.ts",
      import.meta.url,
    ),
  );

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: sourceDirectory,
      },
      {
        find: "server-only",
        replacement:
          serverOnlyTestShim,
      },
    ],
  },

  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
    ],

    clearMocks: true,
    mockReset: true,
    restoreMocks: true,

    /*
     * Media-security tests may intentionally exercise
     * large decoded dimensions. Keep files serial to
     * avoid accidental CI memory amplification.
     */
    fileParallelism: false,
  },
});