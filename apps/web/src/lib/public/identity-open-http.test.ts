import { expect, it, vi } from "vitest";
import { createIdentityConnectionPost, publicIdentityOrigin } from "./identity-open-http";
import { isPublicIdentityPath, isPublicIdentityOpenPath } from "./identity-path";
const origin = "https://spall.example.test"; const binding = "a".repeat(64);
function request(body = `binding=${binding}`, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/public/identity/public-one/open`, { method: "POST", body,
    headers: { origin, "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin", ...headers } });
}
it("native POST navigates only to fresh server-selected destination with no-store/referrer", async () => {
  const open = vi.fn(async () => "https://example.test/link");
  const response = await createIdentityConnectionPost(origin, open)(request(), "PUBLIC-ONE");
  expect(response.status).toBe(200); expect(response.headers.has("location")).toBe(false);
  const document = await response.text(); expect(document).toContain('window.location.replace("https://example.test/link")');
  const nonce = document.match(/script nonce="([A-Za-z0-9+/=]+)"/)![1];
  expect(response.headers.get("content-security-policy")).toContain(`script-src 'nonce-${nonce}'`);
  expect(document).toContain('<noscript>');
  expect(response.headers.get("cache-control")).toContain("no-store"); expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(open).toHaveBeenCalledExactlyOnceWith("public-one", binding);
});
it.each([{origin:"https://evil.test"},{origin:"null"},{"sec-fetch-site":"cross-site"},{"content-type":"application/json"},{"content-length":"513"}])("denies origin/type/length %j before provider", async headers => {
  const open = vi.fn(); const reply = await createIdentityConnectionPost(origin, open)(request(undefined, headers as Record<string,string>), "public-one");
  expect(reply.status).toBe(403); expect(open).not.toHaveBeenCalled();
});
it.each([`binding=${binding}&binding=${binding}`, `binding=${binding}&url=https://evil.test`, "binding=nope", `binding=${"a".repeat(600)}`, "", `binding=${binding}&owner_id=private`])("denies malformed body %j before provider",async body=>{
  const open=vi.fn();expect((await createIdentityConnectionPost(origin,open)(request(body),"public-one")).status).toBe(403);expect(open).not.toHaveBeenCalled();
});
it.each([null,"javascript:alert(1)","https://evil.test/../private"])("denies unsafe result %s without Location",async destination=>{
 const reply=await createIdentityConnectionPost(origin,async()=>destination)(request(),"public-one");expect(reply.status).toBe(403);expect(reply.headers.has("location")).toBe(false);
});
it("never opens on GET or provider exception",async()=>{
 const open=vi.fn();expect((await createIdentityConnectionPost(origin,open)(new Request(origin),"public-one")).status).toBe(403);expect(open).not.toHaveBeenCalled();
 expect((await createIdentityConnectionPost(origin,async()=>{throw Error("private");})(request(),"public-one")).status).toBe(403);
});
it("stalled request body denies on deadline without provider",async()=>{
 const open=vi.fn();const req=new Request(origin,{method:"POST",headers:{origin,"content-type":"application/x-www-form-urlencoded"},body:new ReadableStream({pull(){return new Promise(()=>{});}}),duplex:"half"} as RequestInit);
 expect((await createIdentityConnectionPost(origin,open)(req,"public-one")).status).toBe(403);expect(open).not.toHaveBeenCalled();
});
it.each([undefined,"https://example.test/path","https://user@example.test","https://example.test/","http://public.example.test"])("denies invalid configured origin %s", value=>expect(publicIdentityOrigin(value)).toBeNull());
it.each(["/login","/signup","/recovery","/dashboard","/ops","/api","/media","/onboarding","/auth","/a/b","/ab"])("keeps static/private path %s out of public session bypass",path=>expect(isPublicIdentityPath(path)).toBe(false));
it("accepts only single-handle and exact open route",()=>{
 expect(isPublicIdentityPath("/PUBLIC-one")).toBe(true);expect(isPublicIdentityOpenPath("/api/public/identity/public-one/open")).toBe(true);expect(isPublicIdentityOpenPath("/api/public/identity/public-one/open/extra")).toBe(false);
});
