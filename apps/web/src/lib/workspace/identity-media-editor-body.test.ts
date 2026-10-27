import { afterEach, expect, it, vi } from "vitest";
import { readIdentityMediaEditorCommandRequest as read, identityMediaEditorMaximumBodyReads as maximumReads } from "./identity-media-editor-body";
import { identityMediaEditorMaximumBodyBytes as maximum } from "./identity-media-editor-request";

const origin = "https://editor.example.test";
const command = { action: "add_media_block", base_collection_revision: 3, is_visible: false,
  media_working: { kind: "media", asset_key: "ABCDEF00-0000-4000-8000-000000000003", alt_text: " <Raw> 😀 " } };
const bytes = (text: string) => new TextEncoder().encode(text);
function fixture(chunks: Uint8Array[] = [bytes(JSON.stringify(command))], extra: Record<string, string> = {}, signal?: AbortSignal) {
  let pulls = 0, cancels = 0, index = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    pulls++; if (index < chunks.length) controller.enqueue(chunks[index++]!); else controller.close();
  }, cancel() { cancels++; } }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: string } = { method: "POST", headers: { origin, host: "editor.example.test", "content-type": "application/json", ...extra }, body: stream, duplex: "half", ...(signal ? { signal } : {}) };
  const request = new Request(`${origin}/fixture`, init);
  const permit = vi.fn<(action: "identity_media_command", signal: AbortSignal) => Promise<unknown>>(async () => true);
  return { request, permit, run: () => read(request, origin, permit), counts: () => ({ pulls, cancels }) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it("admits metadata then permits once before taking the reader; parsed command is not a save", async () => {
  const f = fixture(); f.permit.mockImplementation(async (action, signal) => {
    expect(action).toBe("identity_media_command"); expect(signal.aborted).toBe(false);
    expect(f.counts()).toEqual({ pulls: 0, cancels: 0 }); expect(f.request.body!.locked).toBe(false); return true;
  });
  expect(await f.run()).toEqual(command); expect(f.permit).toHaveBeenCalledTimes(1);
  expect(f.counts()).toEqual({ pulls: 2, cancels: 0 }); expect(f.request.body!.locked).toBe(false);
});
it.each(["add_media_block", "initialize_media_block", "save_media_block"] as const)("preserves explicit %s raw/null structured fields", async action => {
  for (const asset_key of [null, "ABCDEF00-0000-4000-8000-000000000003"]) {
    for (const value of [null, "", " \t\r\n ", "x\u0001", "<script>raw()</script>", "e\u0301🐈", "🐈".repeat(2048)]) {
      for (const is_visible of [true, false]) {
        const command = { action, base_collection_revision: action === "initialize_media_block" ? null : 3,
          ...(action === "save_media_block" ? { block_id: "90000000-0000-4000-8000-000000000003" } : { is_visible }),
          media_working: { kind: "media", asset_key, alt_text: value } };
        expect(await fixture([bytes(JSON.stringify(command))]).run()).toEqual(command);
      }
    }
  }
});
it.each([
  { origin: "https://evil.test" }, { host: "evil.test" }, { "content-type": "text/plain" }, { "content-length": "32769" },
  { "sec-fetch-site": "cross-site" }, { "transfer-encoding": "chunked" }, { "content-encoding": "gzip" },
])("rejects metadata %j without permit or stream access", async extra => {
  const f = fixture(undefined, extra); expect(await f.run()).toBeNull(); expect(f.permit).not.toHaveBeenCalled(); expect(f.counts()).toEqual({ pulls: 0, cancels: 0 });
});
it.each([false, null, undefined, 1, "true", {}, { allowed: true }])("requires literal true permit, got %j", async allowed => {
  const f = fixture(); f.permit.mockResolvedValue(allowed); expect(await f.run()).toBeNull();
  expect(f.permit).toHaveBeenCalledTimes(1); expect(f.counts()).toEqual({ pulls: 0, cancels: 0 }); expect(f.request.body!.locked).toBe(false);
});
it.each(["throw", "reject"])("permit %s returns no raw diagnostic or body access", async how => {
  const f = fixture(); f.permit.mockImplementation(() => { if (how === "throw") throw new Error("private"); return Promise.reject(new Error("private")); });
  expect(await f.run()).toBeNull(); expect(f.counts()).toEqual({ pulls: 0, cancels: 0 }); expect(f.permit).toHaveBeenCalledTimes(1);
});
it.each(["origin", "host", "content-type", "content-length", "content-encoding", "transfer-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest"])("denies %s drift during permit before reading", async key => {
  const f = fixture(); f.permit.mockImplementation(async () => { f.request.headers.set(key, key === "content-length" ? "2" : "changed"); return true; });
  expect(await f.run()).toBeNull(); expect(f.counts()).toEqual({ pulls: 0, cancels: 0 });
});
it("denies post-permit metadata drift even when the replacement is individually admissible", async () => {
  const f = fixture(); f.permit.mockImplementation(async () => { f.request.headers.set("sec-fetch-mode", "cors"); return true; });
  expect(await f.run()).toBeNull(); expect(f.counts().pulls).toBe(0);
});
it.each(["0", "1", "32768"])("rejects lying declared length %s against actual bytes", async length => {
  const f = fixture(undefined, { "content-length": length }); expect(await f.run()).toBeNull(); expect(f.permit).toHaveBeenCalledTimes(1);
});
it("accepts exact multibyte declared length, not JS character count", async () => {
  const body = bytes(JSON.stringify(command)); expect(await fixture([body], { "content-length": String(body.byteLength) }).run()).toEqual(command);
  expect(await fixture([body], { "content-length": String(JSON.stringify(command).length) }).run()).toBeNull();
});
it.each([maximum, maximum + 1])("enforces actual byte ceiling %s without Content-Length", async size => {
  const text = JSON.stringify(command), body = bytes(text + " ".repeat(size - bytes(text).length));
  const f = fixture([body]); expect(await f.run()).toEqual(size === maximum ? command : null);
  expect(f.counts().pulls).toBe(size === maximum ? 2 : 1);
});
it("enforces aggregate bytes across chunks and stops before another read", async () => {
  const f = fixture([new Uint8Array(maximum), new Uint8Array([32]), bytes(JSON.stringify(command))]);
  expect(await f.run()).toBeNull(); expect(f.counts()).toEqual({ pulls: 2, cancels: 1 });
});
it("reconstructs split UTF8 code points and copies producer-owned chunks", async () => {
  const body = bytes(JSON.stringify(command)); expect(await fixture(Array.from(body, b => new Uint8Array([b]))).run()).toEqual(command);
  const first = body.slice(0, 10), second = body.slice(10); let calls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) { if (calls++ === 0) c.enqueue(first); else if (calls === 2) { first.fill(0); c.enqueue(second); } else c.close(); } }, { highWaterMark: 0 });
  const f = fixture(); const init: RequestInit & { duplex: string } = { method: "POST", headers: f.request.headers, body: stream, duplex: "half" };
  expect(await read(new Request(`${origin}/fixture`, init), origin, f.permit)).toEqual(command);
});
it("counts empty reads and never exceeds the finite read ceiling", async () => {
  const f = fixture(Array.from({ length: maximumReads + 1 }, () => new Uint8Array()));
  expect(await f.run()).toBeNull(); expect(f.counts()).toEqual({ pulls: maximumReads, cancels: 1 });
});
it.each(["", "null", "[]", "{}", "not JSON", JSON.stringify({ ...command, action: "publish" }), JSON.stringify({ ...command, owner_id: "forged" }),
  JSON.stringify({ ...command, base_collection_revision: null }), JSON.stringify({ ...command, is_visible: "false" }),
  JSON.stringify({ ...command, media_working: { ...command.media_working, alt_text: "\u0000" } }),
])("rejects invalid JSON/command %j after one permit", async text => {
  const f = fixture([bytes(text)]); expect(await f.run()).toBeNull(); expect(f.permit).toHaveBeenCalledTimes(1);
});
it.each([new Uint8Array([0xff]), new Uint8Array([0xc3]), bytes("\ufeff" + JSON.stringify(command))])("rejects malformed UTF8 or BOM %j", async invalid => {
  expect(await fixture([invalid]).run()).toBeNull();
});
it("denies an errored body and cancels only a reader it acquired", async () => {
  const f = fixture(); const stream = new ReadableStream<Uint8Array>({ pull() { throw new Error("private"); } }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: string } = { method: "POST", headers: f.request.headers, body: stream, duplex: "half" };
  expect(await read(new Request(`${origin}/fixture`, init), origin, f.permit)).toBeNull();
});
it.each(["permit", "body"])("deadline during %s returns promptly and cannot revive output", async phase => {
  vi.useFakeTimers(); const f = fixture(); let release: (() => void) | undefined;
  let request = f.request, pulls = 0, cancels = 0;
  if (phase === "permit") f.permit.mockImplementation(async () => { await new Promise<void>(r => { release = r; }); return true; });
  else {
    const stream = new ReadableStream<Uint8Array>({ async pull(c) { pulls++; await new Promise<void>(r => { release = r; }); try { c.enqueue(bytes(JSON.stringify(command))); } catch { /* Closed after cancellation. */ } }, cancel() { cancels++; return new Promise(() => {}); } }, { highWaterMark: 0 });
    const init: RequestInit & { duplex: string } = { method: "POST", headers: request.headers, body: stream, duplex: "half" }; request = new Request(`${origin}/fixture`, init);
  }
  const pending = read(request, origin, f.permit); await vi.advanceTimersByTimeAsync(5001);
  expect(await pending).toBeNull(); expect(f.permit.mock.calls[0]![1].aborted).toBe(true);
  release!(); await vi.advanceTimersByTimeAsync(10000); expect(f.permit).toHaveBeenCalledTimes(1);
  if (phase === "permit") expect(f.counts()).toEqual({ pulls: 0, cancels: 0 });
  else { expect(pulls).toBe(1); expect(cancels).toBe(1); }
  expect(vi.getTimerCount()).toBe(0);
});
it("shares one deadline across permit and body instead of granting a new body window", async () => {
  vi.useFakeTimers(); const f = fixture(); f.permit.mockImplementation(async () => { await new Promise(r => setTimeout(r, 4000)); return true; });
  let cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: string } = { method: "POST", headers: f.request.headers, body: stream, duplex: "half" };
  const pending = read(new Request(`${origin}/fixture`, init), origin, f.permit);
  await vi.advanceTimersByTimeAsync(5001); expect(await pending).toBeNull(); expect(cancelled).toBe(1); expect(vi.getTimerCount()).toBe(0);
});
it.each(["before", "permit", "body"])("abort during %s never continues phases", async phase => {
  const controller = new AbortController(); const f = fixture(undefined, {}, controller.signal);
  if (phase === "before") controller.abort();
  else if (phase === "permit") f.permit.mockImplementation(async () => { controller.abort(); return true; });
  else f.permit.mockImplementation(async () => { queueMicrotask(() => controller.abort()); return true; });
  expect(await f.run()).toBeNull(); if (phase === "before") expect(f.permit).not.toHaveBeenCalled();
  expect(f.counts().pulls).toBe(0);
});
it("checks elapsed monotonic time even before a delayed timer callback", async () => {
  let now = 0; vi.spyOn(performance, "now").mockImplementation(() => now);
  const f = fixture(); f.permit.mockImplementation(async () => { now = 5001; return true; });
  expect(await f.run()).toBeNull(); expect(f.counts()).toEqual({ pulls: 0, cancels: 0 });
});
it("rejects metadata drift caused while reading and emits no parsed command", async () => {
  const f = fixture(); let calls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) { calls++; f.request.headers.set("origin", "https://evil.test"); c.enqueue(bytes(JSON.stringify(command))); } }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: string } = { method: "POST", headers: f.request.headers, body: stream, duplex: "half" };
  const r = new Request(`${origin}/fixture`, init);
  // Mutate the actual request's observed metadata, not a copied Headers instance.
  f.permit.mockImplementation(async () => { f.request = r; return true; });
  expect(await read(r, origin, f.permit)).toBeNull(); expect(calls).toBe(1);
});
it("releases listeners/timers and cannot read the same consumed request twice", async () => {
  vi.useFakeTimers(); const f = fixture(); const remove = vi.spyOn(f.request.signal, "removeEventListener");
  expect(await f.run()).toEqual(command); expect(await f.run()).toBeNull(); expect(f.permit).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function)); expect(vi.getTimerCount()).toBe(0);
});
it("aborts promptly while an owned read hangs and cancels only that reader", async () => {
  vi.useFakeTimers(); const controller = new AbortController(), f = fixture(); let cancelled = 0;
  const stream = new ReadableStream<Uint8Array>({ pull() { controller.abort(); return new Promise(() => {}); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: string } = { method: "POST", headers: f.request.headers, body: stream, duplex: "half", signal: controller.signal };
  expect(await read(new Request(`${origin}/fixture`, init), origin, f.permit)).toBeNull();
  expect(cancelled).toBe(1); expect(f.permit.mock.calls[0]![1].aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
});
it("never cancels or takes a reader already owned by another consumer", async () => {
  const f = fixture(), reader = f.request.body!.getReader(); expect(await f.run()).toBeNull();
  expect(f.permit).not.toHaveBeenCalled(); expect(f.counts()).toEqual({ pulls: 0, cancels: 0 }); reader.releaseLock();
});
it("admits exactly the read ceiling including the terminal read for an exact-cap one-byte chunk stream", async () => {
  const text = JSON.stringify(command), body = bytes(text + " ".repeat(maximum - bytes(text).length));
  const f = fixture(Array.from({ length: maximum }, (_, i) => body.slice(i, i + 1))); expect(await f.run()).toEqual(command);
  expect(f.counts()).toEqual({ pulls: maximumReads, cancels: 0 });
});
it("rejects a stream producing non-byte chunks without coercion", async () => {
  const f = fixture(["private" as unknown as Uint8Array]); expect(await f.run()).toBeNull(); expect(f.counts()).toEqual({ pulls: 1, cancels: 1 });
});

it.each(["add_media_block", "initialize_media_block", "save_media_block"] as const)("accepts maximum escaped Media alt for %s", async action => {
  const target = action === "save_media_block" ? ',"block_id":"90000000-0000-4000-8000-000000000003"' : ',"is_visible":false';
  const base = action === "initialize_media_block" ? "null" : String(Number.MAX_SAFE_INTEGER);
  const body = '{"action":"' + action + '","base_collection_revision":' + base + target
    + ',"media_working":{"kind":"media","asset_key":"ABCDEF00-0000-4000-8000-000000000003","alt_text":"' + '\\ud83d\\ude00'.repeat(2048) + '"}}';
  const encoded = bytes(body); expect(encoded.byteLength).toBeGreaterThan(24576); expect(encoded.byteLength).toBeLessThan(maximum);
  const f = fixture([encoded.slice(0, 13), encoded.slice(13)], { "content-length": String(encoded.byteLength) });
  expect(await f.run()).toEqual(JSON.parse(body)); expect(f.permit.mock.calls[0]![0]).toBe("identity_media_command");
});
it("counts terminal read after fragmented bytes and empty chunks", async () => {
  const body = bytes(JSON.stringify(command));
  const chunks = [...Array.from(body, b => new Uint8Array([b])), ...Array.from({ length: maximumReads - body.length }, () => new Uint8Array())];
  const f = fixture(chunks); expect(await f.run()).toBeNull();
  expect(f.counts()).toEqual({ pulls: maximumReads, cancels: 1 });
});
it("performs no fetch or UUID allocation while reading a local command", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected I/O"));
  const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
  expect(await fixture().run()).toEqual(command); expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
});
it.each(["content-type", "content-length", "content-encoding", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest"])("rejects individually admissible %s replacement during permit", async key => {
  const f = fixture();
  const replacements: Record<string, string> = { origin, host: "editor.example.test", "content-type": "application/json;charset=utf-8",
    "content-length": String(bytes(JSON.stringify(command)).length), "content-encoding": "identity", "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
  f.permit.mockImplementation(async () => { f.request.headers.set(key, replacements[key]!); return true; });
  expect(await f.run()).toBeNull(); expect(f.counts()).toEqual({ pulls: 0, cancels: 0 });
});
it("copies Node Buffer chunks instead of retaining Buffer.slice aliases", async () => {
  const body = bytes(JSON.stringify(command)), first = Buffer.from(body.slice(0, 10)), second = body.slice(10);
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (pulls++ === 0) controller.enqueue(first);
    else if (pulls === 2) { first.fill(0); controller.enqueue(second); }
    else controller.close();
  } }, { highWaterMark: 0 });
  const f = fixture();
  const init: RequestInit & { duplex: string } = { method: "POST", headers: f.request.headers, body: stream, duplex: "half" };
  expect(await read(new Request(`${origin}/fixture`, init), origin, f.permit)).toEqual(command);
});

it.each([
  { media_working: { ...command.media_working, alt_text: "🐈".repeat(2049) } },
  { media_working: { ...command.media_working, asset_key: "not-a-uuid" } },
  { media_working: { ...command.media_working, object_key: "private" } },
  { position: 1 }, { owner_id: "forged" }, { action: "add_contact_block" },
])("rejects Media-only shape violations before any dispatch %j", async change => {
  const f = fixture([bytes(JSON.stringify({ ...command, ...change }))]);
  expect(await f.run()).toBeNull(); expect(f.permit).toHaveBeenCalledTimes(1);
});
