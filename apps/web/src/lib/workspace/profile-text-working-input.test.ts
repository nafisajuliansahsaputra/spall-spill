import { expect, it } from "vitest";
import { profileTextWorkingInputSchema, inspectProfileTextWorkingInput } from "./profile-text-working-input";
it.each([null, "", " \t\r\n "])("retains incomplete name %j and reports local required issue", display_name => {
  const value = { display_name, bio: null }; expect(profileTextWorkingInputSchema.parse(value)).toEqual(value);
  expect(inspectProfileTextWorkingInput(value)).toEqual([{ field: "display_name", code: "display_name_required" }]);
});
it.each(["🙂".repeat(80), " <script>raw()</script> ", " Name "])("diagnostics never rewrite raw name %#", display_name => {
  const value = { display_name, bio: " \r\nOptional\r\nBio \r\n" }; const before = structuredClone(value);
  expect(inspectProfileTextWorkingInput(value)).toEqual([]); expect(value).toEqual(before);
});
it.each([
  [{ display_name: "🙂".repeat(81), bio: null }, "display_name_too_long"],
  [{ display_name: "Na\nme", bio: null }, "display_name_control_character"],
  [{ display_name: "Name", bio: "🙂".repeat(301) }, "bio_too_long"],
  [{ display_name: "Name", bio: "Bio\u0001" }, "bio_control_character"],
] as const)("recoverable invalid values produce local field issue %#", (value, code) => {
  expect(profileTextWorkingInputSchema.safeParse(value).success).toBe(true);
  expect(inspectProfileTextWorkingInput(value).map(x => x.code)).toEqual([code]);
});
it("engineering envelope counts Unicode code points", () => {
  expect(profileTextWorkingInputSchema.safeParse({ display_name: "🙂".repeat(16384), bio: "🙂".repeat(16384) }).success).toBe(true);
});
it.each([{}, [], null, { display_name: "Name" }, { display_name: "Name", bio: 1 },
  { display_name: true, bio: null }, { display_name: "\u0000", bio: null }, { display_name: "\ud800", bio: null },
  { display_name: null, bio: "\udfff" }, { display_name: "x".repeat(16385), bio: null },
  { display_name: null, bio: "🙂".repeat(16385) }, { display_name: null, bio: null, profile_asset_key: "foreign" },
])("rejects transport-invalid or caller media selection %#", value => {
  expect(profileTextWorkingInputSchema.safeParse(value).success).toBe(false);
});
