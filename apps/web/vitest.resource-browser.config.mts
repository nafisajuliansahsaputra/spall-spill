import { defineConfig } from "vitest/config";
import config from "./vitest.config.mjs";

export default defineConfig({ ...config, test: { ...config.test,
  include: ["tests/resource-open-browser.test.ts", "tests/resource-open-network-browser.test.ts", "tests/resource-recognition-browser.test.ts", "tests/chromium-navigation.test.ts"], testTimeout: 30000,
} });
