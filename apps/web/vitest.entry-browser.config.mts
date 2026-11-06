import { defineConfig } from "vitest/config";
import config from "./vitest.config.mjs";
export default defineConfig({ ...config, test: { ...config.test,
  include: ["tests/entry-auth-browser.test.ts", "tests/public-identity-browser.test.ts"], testTimeout: 120000,
} });
