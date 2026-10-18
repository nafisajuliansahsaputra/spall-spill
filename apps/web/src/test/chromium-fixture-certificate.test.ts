import { expect, it } from "vitest";
import { chromiumFixture } from "../../tests/chromium-fixture";

it.each(["", "*", "a,b", "--ignore-certificate-errors", "a".repeat(43), "a".repeat(44),
  "a".repeat(42) + "B=", "a".repeat(43) + "=\n", null, 7])("rejects invalid certificate pin %j before browser startup", async value => {
  await expect(chromiumFixture({ certificateSpki: value as string })).rejects.toThrow("Invalid fixture certificate pin");
});
