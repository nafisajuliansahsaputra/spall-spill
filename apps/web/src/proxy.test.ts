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
