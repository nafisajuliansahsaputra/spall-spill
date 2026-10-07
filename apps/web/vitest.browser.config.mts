import { defineConfig } from "vitest/config";
import config from "./vitest.config.mjs";

export default defineConfig({ ...config, test: { ...config.test,
  include: ["tests/product-click-browser.test.ts"], testTimeout: 30000,
} });
