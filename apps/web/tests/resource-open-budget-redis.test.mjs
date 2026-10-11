import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const execute = promisify(execFile);
const source = await readFile(new URL("../src/lib/public/product-click-budget.ts", import.meta.url), "utf8");
const script = source.match(/export const productClickBudgetScript = `([\s\S]*?)`;/)?.[1];
assert.ok(script, "committed Lua budget script must exist");
let directory, socket, server;
const command = async (...args) => (await execute("redis-cli", ["-s", socket, "--raw", ...args.map(String)], { timeout: 5000 })).stdout.trim();
const grant = (prefix, cost, actionLimit = 10, workLimit = 100, window = 3600000, action = "issue") =>
  command("EVAL", script, 2, `${prefix}:${action}`, `${prefix}:work`, window, actionLimit, workLimit, cost);
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "spall-budget-")); socket = join(directory, "redis.sock");
  server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700",
    "--dir", directory, "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  let failure; server.on("error", e => { failure = e; });
  for (let i = 0; i < 50; i++) {
    if (failure) throw failure;
    try { if (await command("PING") === "PONG") {
      const [seconds, microseconds] = (await command("TIME")).split("\n").map(Number);
      const remaining = 3600000 - (seconds * 1000 + Math.floor(microseconds / 1000)) % 3600000;
      if (remaining < 3000) await new Promise(resolve => setTimeout(resolve, remaining + 20));
      return;
    } } catch { /* startup only */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("isolated Redis did not become ready");
});
after(async () => {
  if (server && server.exitCode === null) {
    try { await command("SHUTDOWN", "NOSAVE"); } catch { server.kill("SIGTERM"); }
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});
test("Resource issue and redeem share work but preserve separate request and Product counters", async () => {
  const resource = "spall-resource-open:test:{fixture}"; const product = "spall-click:test:{fixture}";
  assert.equal(await grant(product, 4), "1");
  assert.equal(await grant(resource, 4, 10, 7), "1");
  assert.equal(await grant(resource, 4, 10, 7), "0");
  assert.equal(await grant(resource, 3, 10, 7, 3600000, "redeem"), "1");
  assert.equal(await grant(resource, 3, 10, 7, 3600000, "redeem"), "0");
  assert.equal(await command("HGET", `${resource}:issue`, "count"), "1");
  assert.equal(await command("HGET", `${resource}:redeem`, "count"), "1");
  assert.equal(await command("HGET", `${resource}:work`, "count"), "7");
  assert.equal(await command("HGET", `${product}:issue`, "count"), "1");
  assert.equal(await command("HGET", `${product}:work`, "count"), "4");
});
test("competing Resource issues admit only whole four-unit grants", async () => {
  const prefix = "spall-resource-open:race:{fixture}";
  const results = await Promise.all(Array.from({ length: 24 }, () => grant(prefix, 4, 20, 12)));
  assert.equal(results.filter(x => x === "1").length, 3);
  assert.equal(results.filter(x => x === "0").length, 21);
  assert.equal(await command("HGET", `${prefix}:issue`, "count"), "3");
  assert.equal(await command("HGET", `${prefix}:work`, "count"), "12");
});
test("Resource request exhaustion leaves both counters unchanged", async () => {
  const prefix = "spall-resource-open:request:{fixture}";
  assert.equal(await grant(prefix, 4, 1), "1");
  assert.equal(await grant(prefix, 4, 1), "0");
  assert.equal(await command("HGET", `${prefix}:issue`, "count"), "1");
  assert.equal(await command("HGET", `${prefix}:work`, "count"), "4");
});
