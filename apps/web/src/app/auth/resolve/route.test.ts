import { beforeEach, expect, it, vi } from "vitest";
const resolve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/resolved-destination", () => ({ resolveCurrentOwnerDestination: resolve }));
import { GET } from "./route";
beforeEach(() => resolve.mockReset());
it.each(["/login", "/onboarding", "/dashboard", "/dashboard/account-status", "/dashboard/identity"])("keeps %s relative to the browser origin", async path => {
  resolve.mockResolvedValue(path); const response = await GET();
  expect(response.status).toBe(303); expect(response.headers.get("location")).toBe(path);
  expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.text()).toBe("");
});
it.each([null, "https://evil.example/dashboard", "//evil.example/dashboard", "/dashboard/../login", "/dashboard?next=https://evil.example", "/dashboard#private", "/signup", "\\\\evil.example", "/dashboard\r\nLocation: https://evil.example"])("denies unsafe/unexpected resolver output %#", async path => {
  resolve.mockResolvedValue(path); const response = await GET();
  expect(response.status).toBe(503); expect(response.headers.has("location")).toBe(false);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
