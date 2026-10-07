import { describe, expect, it } from "vitest";
import { parseExactSpillReferenceLocator as parse } from "./exact-reference-locator";

describe("unmounted exact-reference locator", () => {
  it.each(["27", "#27"])("normalizes %s without changing requested creator scope", reference => {
    const input = Object.freeze({ handle: "Creator", reference });
    expect(parse(input)).toEqual({ handle: "creator", spill_reference: 27 });
    expect(input).toEqual({ handle: "Creator", reference });
  });
  it.each(["1", "#1", "9007199254740991", "#9007199254740991"])("retains exact valid boundary %s", reference => {
    expect(parse({ handle: "old.creator-1", reference })).toEqual({ handle: "old.creator-1", spill_reference: Number(reference.replace(/^#/, "")) });
  });
  it.each(["", "#", "0", "#0", "027", "#027", "-27", "+27", "27.0", "2.7e1", "0x1b", "27n",
    "9007199254740992", "#9007199254740992", "99999999999999999", "##27", "# 27", " 27", "27 ", "27\n",
    "27\u0000", "２７", "٢٧", "%2327", "%32%37", "27/28", "27?owner=other", "27#28", "27,28", "27_000",
    "Product 27", "https://other.test/27"])("rejects ambiguous or non-exact reference %j", reference => {
    expect(parse({ handle: "creator", reference })).toBeNull();
  });
  it.each([null, undefined, 27, true, new String("27"), ["27"], { toString: () => "27" }])("never coerces reference %j", reference => {
    expect(parse({ handle: "creator", reference })).toBeNull();
  });
  it.each(["ab", " creator", "creator ", "creator/other", "https://creator.test", "créator", "creator\n", "a".repeat(31)])("rejects malformed requested Handle %j", handle => {
    expect(parse({ handle, reference: "27" })).toBeNull();
  });
  it.each([null, undefined, [], "27", { handle: "creator" }, { reference: "27" },
    { handle: "creator", reference: "27", owner_id: "forged" },
    { handle: "creator", reference: "27", destination_url: "https://other.test" },
    { handle: "creator", reference: "27", spill_reference: 28 }])("requires only the strict locator fields %j", input => {
    expect(parse(input)).toBeNull();
  });
  it("fails closed on hostile access without returning partially normalized authority", () => {
    expect(parse({ get handle() { throw new Error("getter"); }, reference: "27" })).toBeNull();
    expect(parse(new Proxy({}, { get: () => { throw new Error("proxy"); } }))).toBeNull();
  });
});
