import { afterEach, expect, it, vi } from "vitest";
import { pageDebuggerUrl } from "../../tests/chromium-fixture";

const page = { type: "page", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/test" };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("waits through empty/worker-only discovery before selecting the allocated page", async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ type: "service_worker" }]).mockResolvedValueOnce([page]);
  const check = vi.fn(); const pending = pageDebuggerUrl("9222", read, check);
  await vi.advanceTimersByTimeAsync(50);
  expect((await pending).href).toBe(page.webSocketDebuggerUrl);
  expect(read).toHaveBeenCalledTimes(3); expect(check).toHaveBeenCalledTimes(6);
  expect(read.mock.calls.every(args => args[0] === read.mock.calls[0]![0])).toBe(true);
});

it.each([null, {}, "targets", [{ type: "page" }], [{ type: "page", webSocketDebuggerUrl: 7 }],
  ...["invalid", "ws://example.test:9222/test", "ws://127.0.0.1:9223/test", "http://127.0.0.1:9222/test"].map(webSocketDebuggerUrl => [{ ...page, webSocketDebuggerUrl }]),
])("rejects malformed or non-loopback discovery without another request: %j", async targets => {
  const read = vi.fn().mockResolvedValue(targets);
  await expect(pageDebuggerUrl("9222", read, () => {})).rejects.toThrow();
  expect(read).toHaveBeenCalledTimes(1);
});

it.each(["", "0", "65536", "not-a-port"])("rejects invalid port %s before enumeration", async port => {
  const read = vi.fn(); await expect(pageDebuggerUrl(port, read, () => {})).rejects.toThrow("Invalid debugger port");
  expect(read).not.toHaveBeenCalled();
});

it("propagates enumeration failure immediately without readiness retry", async () => {
  const error = new Error("enumeration failed"); const read = vi.fn().mockRejectedValue(error);
  await expect(pageDebuggerUrl("9222", read, () => {})).rejects.toBe(error); expect(read).toHaveBeenCalledTimes(1);
});

it.each([0, 1])("observed browser failure in check %s prevents readiness acknowledgment", async phase => {
  const error = new Error("browser exited"); let count = 0;
  const read = vi.fn().mockResolvedValue([page]);
  await expect(pageDebuggerUrl("9222", read, () => { if (count++ === phase) throw error; })).rejects.toBe(error);
  expect(read).toHaveBeenCalledTimes(phase);
});

it("never finds a page beyond the existing five-second aggregate readiness window", async () => {
  vi.useFakeTimers(); const read = vi.fn().mockResolvedValue([]);
  const pending = pageDebuggerUrl("9222", read, () => {});
  const failed = expect(pending).rejects.toThrow("Browser page readiness deadline exceeded");
  await vi.advanceTimersByTimeAsync(5000); await failed;
  const count = read.mock.calls.length;
  expect(read.mock.calls[0]![0].aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(100); expect(read).toHaveBeenCalledTimes(count);
});

it("aborts one stalled enumeration and ignores a late page without further polling", async () => {
  vi.useFakeTimers(); let finish!: (value: unknown) => void;
  const read = vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = pageDebuggerUrl("9222", read, () => {});
  const failed = expect(pending).rejects.toThrow("Browser page readiness deadline exceeded");
  await vi.advanceTimersByTimeAsync(5000); await failed;
  expect(read.mock.calls[0]![0].aborted).toBe(true);
  finish([page]); await vi.advanceTimersByTimeAsync(100);
  expect(read).toHaveBeenCalledTimes(1);
  await expect(pending).rejects.toThrow("Browser page readiness deadline exceeded");
});
