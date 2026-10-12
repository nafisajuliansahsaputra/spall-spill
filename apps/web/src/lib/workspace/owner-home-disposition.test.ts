import { expect, it } from "vitest";
import { resolveOwnerHomeDisposition } from "./owner-home-disposition";
const home = { status: "success", current_handle: "disposition-owner", primary_use_case: "business",
  product_drafts: 1, resource_drafts: 0, identity_work: "unpublished_changes" };
it.each([
  ["unauthenticated", "/login"], ["onboarding_incomplete", "/onboarding"],
  ["restricted", "/dashboard/account-status"], ["suspended", "/dashboard/account-status"],
])("routes %s only to existing account-state destination", (status, href) => {
  expect(resolveOwnerHomeDisposition({ status })).toEqual({ kind: "redirect", href });
});
it.each(["owner_missing", "unavailable"])("%s never fabricates empty Home or account-state redirect", status => {
  expect(resolveOwnerHomeDisposition({ status })).toEqual({ kind: "unavailable" });
});
it.each(["unauthenticated", "owner_missing", "onboarding_incomplete", "restricted", "suspended", "unavailable"])("denies stale Home retained with %s", status => {
  expect(resolveOwnerHomeDisposition({ ...home, status })).toEqual({ kind: "unavailable" });
});
it.each(["creator", "affiliate", "business", "personal", "other"])("preserves %s work without persona permissions or unsupported actions", primary_use_case => {
  const input = { ...home, primary_use_case }; const before = structuredClone(input);
  expect(resolveOwnerHomeDisposition(input)).toEqual({ kind: "home", data: input, actions: [] });
  expect(input).toEqual(before);
});
it.each(["never_published", "unchanged", "unpublished_changes"])("%s is private work truth without public/editor hrefs", identity_work => {
  const input = { ...home, identity_work }; const outcome = resolveOwnerHomeDisposition(input);
  expect(outcome).toEqual({ kind: "home", data: input, actions: [] }); expect(outcome).not.toHaveProperty("href");
});
it.each([null, {}, { status: "active" }, { ...home, current_handle: "OTHER" },
  { ...home, primary_use_case: "admin" }, { ...home, identity_work: "live" },
  { ...home, product_drafts: -1 }, { ...home, resource_drafts: 1.5 },
  { ...home, product_drafts: Number.MAX_SAFE_INTEGER + 1 }, { ...home, resource_drafts: undefined },
  { ...home, owner_id: "private" }, { ...home, identity_published: true },
  { ...home, actions: ["/dashboard/identity"] }, { status: "unavailable", error: "private detail" },
])("malformed/private/public/action payload %j cannot become Home or navigation", value => {
  expect(resolveOwnerHomeDisposition(value)).toEqual({ kind: "unavailable" });
});
