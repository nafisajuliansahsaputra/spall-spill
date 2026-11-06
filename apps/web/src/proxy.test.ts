import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/supabase/proxy", () => ({ updateSession: mocks.session }));
import { proxy } from "./proxy";
it.each(["/media/identity/creator", "/media/product/creator/27"])("public media %s is authorized by Published state without viewer session refresh", async (path) => {
  const response = await proxy(new NextRequest(`https://app.test${path}`));
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(mocks.session).not.toHaveBeenCalled();
});

it.each(["/creator", "/api/public/identity/creator/open"])("public Identity %s ignores viewer session and overwrites caller nonce", async path => {
  const response = await proxy(new NextRequest(`https://app.test${path}`, { headers: { "x-nonce": "AAAAAAAAAAAAAAAAAAAAAAAA", cookie: "untrusted=viewer" } }));
  expect(mocks.session).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  const nonce = response.headers.get("x-middleware-request-x-nonce");
  expect(nonce).toMatch(/^[A-Za-z0-9+/]{24}$/); expect(nonce).not.toBe("AAAAAAAAAAAAAAAAAAAAAAAA");
  expect(response.headers.get("content-security-policy")).toContain(`'nonce-${nonce}'`);
  expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
});
