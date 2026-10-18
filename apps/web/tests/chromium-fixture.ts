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
/** Port-file readiness precedes page-target allocation; never open a debugger from an absent page. */
export async function pageDebuggerUrl(port: string, readTargets: (signal: AbortSignal) => Promise<unknown>, checkBrowser: () => void) {
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) throw new Error("Invalid debugger port");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let selected: URL | undefined;
  const deadline = () => new Error("Browser page readiness deadline exceeded");
  try {
    return await Promise.race([
      (async () => {
        await until(async () => {
          if (controller.signal.aborted) throw deadline(); checkBrowser();
          const targets = await readTargets(controller.signal);
          if (controller.signal.aborted) throw deadline(); checkBrowser();
          if (!Array.isArray(targets)) throw new Error("Invalid debugger targets");
          const page = targets.find(target => target && typeof target === "object" && target.type === "page") as { webSocketDebuggerUrl?: unknown } | undefined;
          if (!page) return false;
          if (typeof page.webSocketDebuggerUrl !== "string") throw new Error("Invalid page debugger");
          const url = new URL(page.webSocketDebuggerUrl);
          if (url.hostname !== "127.0.0.1" || url.protocol !== "ws:" || url.port !== port) throw new Error("Invalid loopback debugger");
          selected = url; return true;
        });
        return selected!;
      })(),
      new Promise<URL>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(deadline()); }, 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
export async function chromiumFixture({ certificateSpki }: { certificateSpki?: string } = {}) {
  if (certificateSpki !== undefined && (typeof certificateSpki !== "string"
    || !/^[A-Za-z0-9+/]{43}=$/.test(certificateSpki)
    || Buffer.from(certificateSpki, "base64").toString("base64") !== certificateSpki)) throw new Error("Invalid fixture certificate pin");
  const directory = await mkdtemp(join(tmpdir(), "spall-click-browser-"));
  const processGroup = process.platform !== "win32";
  const child = spawn(process.env.SPALL_TEST_BROWSER ?? "chromium", ["--headless=new", "--disable-gpu",
    "--disable-background-networking", "--disable-component-update", "--disable-default-apps", "--disable-sync",
    "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "--remote-debugging-port=0",
    `--user-data-dir=${directory}`, ...(certificateSpki ? [`--ignore-certificate-errors-spki-list=${certificateSpki}`] : []),
    ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), "about:blank"], { stdio: "ignore", detached: processGroup });
  let failure: Error | undefined; child.once("error", error => { failure = error; });
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  let socket: WebSocket | undefined; let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const events = new Map<string, ((params: unknown) => void)[]>();
  const interceptions = new Set<string>(); let interceptionActivity = performance.now();
  const terminate = (signal: NodeJS.Signals) => {
    try {
      if (processGroup && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  };
  const close = async () => {
    socket?.close(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error("Browser closed")); } pending.clear();
    terminate("SIGTERM"); await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
    // The parent can exit before profile-writing renderer/utility children do.
    terminate("SIGKILL"); await closed;
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  try {
    let port = "";
    await until(async () => { if (failure) throw failure;
      try { port = (await readFile(join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0]!; return /^\d+$/.test(port); } catch { return false; }
    }, 10000);
    const url = await pageDebuggerUrl(port, async signal => {
      const reply = await fetch(`http://127.0.0.1:${port}/json/list`, { signal });
      if (!reply.ok) throw new Error("Debugger enumeration failed");
      return reply.json() as Promise<unknown>;
    }, () => {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error("Browser exited before page readiness");
    });
    socket = new WebSocket(url); await until(() => socket!.readyState === WebSocket.OPEN);
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: unknown };
      if (message.id) { const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
        if (message.error) p.reject(new Error(message.error.message)); else p.resolve(message.result);
      } else if (message.method) {
        if (message.method === "Fetch.requestPaused") {
          const id = (message.params as { requestId?: unknown }).requestId;
          if (typeof id === "string") { interceptions.add(id); interceptionActivity = performance.now(); }
        }
        for (const handler of events.get(message.method) ?? []) handler(message.params);
      }
    });
    const command = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
      // Controlled navigation must not cancel an unfinished fixture interception.
      if (method === "Page.navigate" || method === "Input.dispatchMouseEvent")
        await until(() => interceptions.size === 0 && performance.now() - interceptionActivity >= 25);
      return await new Promise<T>((resolve, reject) => {
        const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP deadline: ${method}`)); }, 5000);
        pending.set(id, { resolve: value => resolve(value as T), reject, timer }); socket!.send(JSON.stringify({ id, method, params }));
      }).finally(() => {
        if (method === "Fetch.fulfillRequest" || method === "Fetch.failRequest") {
          interceptions.delete(String(params.requestId)); interceptionActivity = performance.now();
        }
      });
    };
    const evaluate = async <T>(expression: string) => {
      const r = await command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, returnByValue: true });
      if (r.exceptionDetails) throw new Error("Browser evaluation failed"); return r.result.value;
    };
    return { command, evaluate, on: (method: string, handler: (params: unknown) => void) => events.set(method, [...(events.get(method) ?? []), handler]), close };
  } catch (error) { await close(); throw error; }
}
