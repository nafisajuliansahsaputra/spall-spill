import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GetObjectCommand } from "@aws-sdk/client-s3";
const mocks = vi.hoisted(() => ({ service: vi.fn(), rpc: vi.fn(), r2: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: mocks.service }));
vi.mock("@/lib/profile-media/r2", () => ({ createProfileMediaR2Connection: mocks.r2 }));
import { readPublishedIdentityMedia } from "./identity-media";
const descriptor = { status: "success", current_handle: "creator", object_key: "working/profile/82000000-0000-4000-8000-000000000001.webp",
  content_type: "image/webp", byte_size: 12, width: 100, height: 100, publication_token: "a".repeat(64) };
function webp() { const bytes = Buffer.alloc(12); bytes.write("RIFF"); bytes.writeUInt32LE(4,4); bytes.write("WEBP",8); return bytes; }
describe("Published Identity media transport", () => {
  beforeEach(() => {
    mocks.service.mockReturnValue({ schema: () => ({ rpc: mocks.rpc }) });
    mocks.rpc.mockResolvedValue({ data: descriptor, error: null });
    mocks.r2.mockReturnValue({ client: { send: mocks.send }, bucket: "test-private-bucket" });
    mocks.send.mockImplementation(async () => ({ ContentType: "image/webp", ContentLength: 12, Body: Readable.from([webp()]) }));
  });
  it("downloads only exact authoritative Published selection and rechecks before delivery", async () => {
    expect(await readPublishedIdentityMedia("CREATOR")).toEqual(webp());
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_published_identity_media_server", { input_handle: "creator" });
    const [command, options] = mocks.send.mock.calls[0]!;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "test-private-bucket", Key: descriptor.object_key });
    expect(options.abortSignal).toBeInstanceOf(AbortSignal);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]!);
    expect(mocks.send.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[1]!);
  });
  it.each(["../creator", " creator", "a", "https://storage.test/object", "creator/asset", "créator", "a".repeat(31)])(
    "rejects invalid public locator without privileged lookup: %s", async (handle) => {
      expect(await readPublishedIdentityMedia(handle)).toBeNull(); expect(mocks.service).not.toHaveBeenCalled();
    });
  it.each([null, { status: "unavailable" }, { ...descriptor, owner_id: "foreign" },
    { ...descriptor, object_key: "staging/profile/raw" }, { ...descriptor, content_type: "image/svg+xml" },
    { ...descriptor, byte_size: 3145729 }, { ...descriptor, width: 4096 }, { ...descriptor, publication_token: "untrusted" }])(
    "never downloads malformed/unavailable/private selector DTO %j", async (data) => {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect(await readPublishedIdentityMedia("creator")).toBeNull(); expect(mocks.send).not.toHaveBeenCalled();
    });
  it.each([{ status: "unavailable" }, { ...descriptor, publication_token: "b".repeat(64) },
    { ...descriptor, object_key: "working/profile/82000000-0000-4000-8000-000000000002.webp" }])(
    "denies an intervening revocation/publication replacement: %j", async (data) => {
      mocks.rpc.mockResolvedValueOnce({ data: descriptor, error: null }).mockResolvedValueOnce({ data, error: null });
      expect(await readPublishedIdentityMedia("creator")).toBeNull(); expect(mocks.send).toHaveBeenCalledOnce();
    });
  it.each(["mime", "declared_size", "missing_body", "actual_size", "oversize", "magic", "framing", "stream_error"])(
    "denies %s and releases the object stream", async (failure) => {
      let bytes = webp();
      if (failure === "actual_size") bytes = bytes.subarray(0,11);
      if (failure === "oversize") bytes = Buffer.concat([bytes,Buffer.alloc(1)]);
      if (failure === "magic") bytes.write("HTML");
      if (failure === "framing") bytes.writeUInt32LE(99,4);
      const body = Readable.from(failure === "stream_error" ? (async function* () { throw new Error("provider secret"); })() : [bytes]);
      mocks.send.mockResolvedValue({ ContentType: failure === "mime" ? "text/html" : "image/webp",
        ContentLength: failure === "declared_size" ? 99 : 12, Body: failure === "missing_body" ? undefined : body });
      expect(await readPublishedIdentityMedia("creator")).toBeNull();
      if (failure !== "missing_body") expect(body.destroyed).toBe(true);
      expect(mocks.rpc).toHaveBeenCalledOnce();
    });
  it("bounds a stalled body with the deadline and returns no data", async () => {
    vi.useFakeTimers();
    const body = new Readable({ read() {} });
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    mocks.send.mockResolvedValue({ ContentType: "image/webp", ContentLength: 12, Body: body });
    const pending = readPublishedIdentityMedia("creator");
    await vi.advanceTimersByTimeAsync(1); controller.abort();
    expect(await pending).toBeNull(); expect(body.destroyed).toBe(true);
    vi.useRealTimers();
  });
  it.each(["database", "storage", "credential"])("returns no provider/credential payload on %s failure", async (where) => {
    const error = new Error("private provider credentials");
    if (where === "database") mocks.rpc.mockRejectedValue(error);
    if (where === "storage") mocks.send.mockRejectedValue(error);
    if (where === "credential") mocks.service.mockImplementation(() => { throw error; });
    expect(await readPublishedIdentityMedia("creator")).toBeNull();
  });
});
