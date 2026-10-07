import { describe, expect, it } from "vitest";
import { RESOURCE_TYPES } from "@/lib/onboarding/resource-draft-contract";
import { publicResourcePayloadSchema } from "./resource-contract";

const resource = {
  status: "success", current_handle: "creator", display_name: "Published Creator",
  spill_reference: 27, resource_type: "portfolio", title: "Published Portfolio",
  available: true, source_url: "https://portfolio.example.test/works?creator=original&campaign=A%2FB",
};
describe("staged Published Resource context", () => {
  it("preserves exact creator URL and explicit semantic type", () => {
    expect(publicResourcePayloadSchema.parse(resource)).toEqual(resource);
  });
  it.each(RESOURCE_TYPES)("retains %s recognition without a degraded URL", (resourceType) => {
    const degraded = { ...resource, resource_type: resourceType, available: false, source_url: null };
    expect(publicResourcePayloadSchema.parse(degraded)).toEqual(degraded);
  });
  it("accepts generic unavailable without lifecycle or scanner reasons", () => {
    expect(publicResourcePayloadSchema.parse({ status: "unavailable" })).toEqual({ status: "unavailable" });
  });
  it.each([
    { status: "unavailable", reason: "hidden" }, { ...resource, owner_id: "private" },
    { ...resource, item_id: "private" }, { ...resource, revision: 2 },
    { ...resource, receipt_id: "private" }, { ...resource, publication_token: "private" },
    { ...resource, scanner_reason: "private" }, { ...resource, category: "invented" },
    { ...resource, available: false }, { ...resource, source_url: null },
    { ...resource, available: "true" }, { ...resource, resource_type: "pdf" },
    { ...resource, resource_type: null }, { ...resource, title: " " },
    { ...resource, title: "Title\ncontrol" }, { ...resource, title: "x".repeat(161) },
    { ...resource, display_name: " " }, { ...resource, display_name: "x".repeat(81) },
    { ...resource, display_name: "Name\u0000control" }, { ...resource, current_handle: "../creator" },
    { ...resource, spill_reference: "27" }, { ...resource, spill_reference: 0 },
    { ...resource, spill_reference: 1.5 }, { ...resource, spill_reference: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects malformed or private projection %j", (payload) => {
    expect(publicResourcePayloadSchema.safeParse(payload).success).toBe(false);
  });
  it.each([
    "javascript:alert(1)", "file:///private", "https://user:password@portfolio.example.test/works",
    "https://127.0.0.1/", "https://localhost/", "https://portfolio.example.test/works#hidden",
    " https://portfolio.example.test/works", "https://portfolio.example.test/works ",
    "https://portfolio.example.test/works\\escape", "https://PORTFOLIO.example.test/works",
    "https://portfolio.example.test", "https://portfolio.example.test/" + "x".repeat(2048),
  ])("rejects policy-invalid/noncanonical URL %s without rewriting it", (sourceUrl) => {
    expect(publicResourcePayloadSchema.safeParse({ ...resource, source_url: sourceUrl }).success).toBe(false);
  });
  it("permits the exact safe integer boundary without coercion", () => {
    expect(publicResourcePayloadSchema.parse({ ...resource, spill_reference: Number.MAX_SAFE_INTEGER }))
      .toEqual({ ...resource, spill_reference: Number.MAX_SAFE_INTEGER });
  });
});
