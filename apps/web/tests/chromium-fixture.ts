import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function until(predicate: () => boolean | Promise<boolean>, milliseconds = 5000) {
  const deadline = performance.now() + milliseconds;
  while (!(await predicate())) {
    if (performance.now() >= deadline) throw new Error("Browser fixture deadline exceeded");
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}
export async function chromiumFixture() {
  const directory = await mkdtemp(join(tmpdir(), "spall-click-browser-"));
  const child = spawn(process.env.SPALL_TEST_BROWSER ?? "chromium", ["--headless=new", "--disable-gpu",
    "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync",
    "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "--remote-debugging-port=0",
    `--user-data-dir=${directory}`, ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), "about:blank"], { stdio: "ignore" });
  let failure: Error | undefined; child.once("error", error => { failure = error; });
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  let socket: WebSocket | undefined; let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const events = new Map<string, ((params: unknown) => void)[]>();
  const close = async () => {
    socket?.close(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error("Browser closed")); } pending.clear();
    child.kill("SIGTERM"); await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await closed; }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    let port = "";
    await until(async () => { if (failure) throw failure;
      try { port = (await readFile(join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0]!; return /^\d+$/.test(port); } catch { return false; }
    }, 10000);
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()) as { type: string; webSocketDebuggerUrl: string }[];
    const url = new URL(pages.find(p => p.type === "page")!.webSocketDebuggerUrl);
    if (url.hostname !== "127.0.0.1" || url.protocol !== "ws:" || url.port !== port) throw new Error("Invalid loopback debugger");
    socket = new WebSocket(url); await until(() => socket!.readyState === WebSocket.OPEN);
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: unknown };
      if (message.id) { const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(new Error(message.error.message)); else p.resolve(message.result);
      } else if (message.method) for (const handler of events.get(message.method) ?? []) handler(message.params);
    });
    const command = <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => new Promise((resolve, reject) => {
      const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP deadline: ${method}`)); }, 5000);
      pending.set(id, { resolve: value => resolve(value as T), reject, timer }); socket!.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async <T>(expression: string) => {
      const r = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, returnByValue: true });
      if (r.exceptionDetails) throw new Error("Browser evaluation failed"); return r.result.value;
    };
    return { command, evaluate, on: (method: string, handler: (params: unknown) => void) => events.set(method, [...(events.get(method) ?? []), handler]), close };
  } catch (error) { await close(); throw error; }
}
