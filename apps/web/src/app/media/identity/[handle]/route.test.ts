import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/public/identity-media", () => ({ readPublishedIdentityMedia: mocks.read }));
import { GET } from "./route";
describe("Published media HTTP response", () => {
  beforeEach(() => mocks.read.mockResolvedValue(null));
  it("returns a generic no-store 404 for unavailable media", async () => {
    const response = await GET(new Request("https://app.test/media/identity/creator?asset_key=foreign"), { params: Promise.resolve({ handle: "creator" }) });
    expect(response.status).toBe(404); expect(await response.text()).toBe("Unavailable");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith("creator");
  });
  it("serves only bytes with fixed safe headers and no conditional-cache shortcut", async () => {
    const bytes = Buffer.from("bounded canonical bytes"); mocks.read.mockResolvedValue(bytes);
    const response = await GET(new Request("https://app.test/media/identity/creator", { headers: { "If-None-Match": "old", Range: "bytes=0-3" } }), { params: Promise.resolve({ handle: "creator" }) });
    expect(response.status).toBe(200); expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(bytes));
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.has("location")).toBe(false); expect(response.headers.has("etag")).toBe(false);
  });
});
