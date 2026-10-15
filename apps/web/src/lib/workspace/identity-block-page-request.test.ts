import { expect, it, vi } from "vitest";
import { identityBlockPageRequestSchema, inspectIdentityBlockPageRequest } from "./identity-block-page-request";

const start = { expected_collection_revision: null, after_position: null };
const continuation = { expected_collection_revision: 7, after_position: 42 };
it("requires explicit null/null start without inferring empty or authoritative collection", () => {
  expect(inspectIdentityBlockPageRequest(start)).toEqual({ status: "request", data: start });
});
for (const expected_collection_revision of [1, 2, Number.MAX_SAFE_INTEGER]) {
  it.each([1, 500, 501, 2147483647])(`preserves revision ${expected_collection_revision} and exact safe position %s`, after_position => {
    const value = { expected_collection_revision, after_position };
    expect(inspectIdentityBlockPageRequest(value)).toEqual({ status: "request", data: value });
  });
}
it.each([null, undefined, [], {}, "", "{}", 0, true,
  { after_position: null }, { expected_collection_revision: null },
  { ...start, after_position: undefined }, { ...start, expected_collection_revision: undefined },
  { expected_collection_revision: 1, after_position: null },
  { expected_collection_revision: null, after_position: 1 },
])("rejects missing/mixed start/continuation %j", value => {
  expect(inspectIdentityBlockPageRequest(value)).toEqual({ status: "invalid_page_request" });
});
for (const key of ["expected_collection_revision", "after_position"] as const) {
  it.each([undefined, 0, -1, 1.5, NaN, Infinity, -Infinity, "1", "null", true, false, [], {}, Number.MAX_SAFE_INTEGER + 1])(`rejects ${key} invalid type/range %j`, v => {
    const value = { ...continuation, [key]: v };
    expect(inspectIdentityBlockPageRequest(value)).toEqual({ status: "invalid_page_request" });
    expect(identityBlockPageRequestSchema.safeParse(value).success).toBe(false);
  });
}
it.each([2147483648, Number.MAX_SAFE_INTEGER])("rejects unsafe position %s without reducing it", after_position => {
  expect(inspectIdentityBlockPageRequest({ ...continuation, after_position })).toEqual({ status: "invalid_page_request" });
});
for (const value of [start, continuation]) {
  it.each(["owner_id", "auth_user_id", "block_id", "kind", "is_visible", "source", "page_size", "limit", "offset", "sort", "cursor", "collection", "blocks", "published", "issues"])(`rejects caller selector %s for ${value.after_position === null ? "start" : "continuation"}`, key => {
    expect(inspectIdentityBlockPageRequest({ ...value, [key]: "forged" })).toEqual({ status: "invalid_page_request" });
  });
}
it("does not mutate input, fetch, allocate identity or add authority", () => {
  const fetcher = vi.fn(); const uuid = vi.fn();
  vi.stubGlobal("fetch", fetcher); vi.spyOn(crypto, "randomUUID").mockImplementation(uuid);
  try {
    const value = Object.freeze({ ...continuation });
    expect(inspectIdentityBlockPageRequest(value)).toEqual({ status: "request", data: continuation });
    expect(value).toEqual(continuation);
    expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); vi.restoreAllMocks(); }
});
