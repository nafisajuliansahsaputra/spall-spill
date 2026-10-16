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
const prefix = name => `spall-identity-link-editor:${name}:{fixture}`;
const admit = (name, limit = 10, work = 310, window = 3600000) => grant(prefix(name), 31, limit, work, window, "command");
test("editor competing commands admit only complete31-unit grants", async () => {
  const results = await Promise.all(Array.from({ length: 24 }, () => admit("race", 20, 93)));
  assert.equal(results.filter(x => x === "1").length, 3);
  assert.equal(results.filter(x => x === "0").length, 21);
  assert.equal(await command("HGET", `${prefix("race")}:command`, "count"), "3");
  assert.equal(await command("HGET", `${prefix("race")}:work`, "count"), "93");
});
test("request exhaustion never increments either counter", async () => {
  assert.equal(await admit("requests", 1), "1"); assert.equal(await admit("requests", 1), "0");
  assert.equal(await command("HGET", `${prefix("requests")}:command`, "count"), "1");
  assert.equal(await command("HGET", `${prefix("requests")}:work`, "count"), "31");
});
test("work exhaustion never increments either counter or Product/Resource keys", async () => {
  assert.equal(await grant("spall-click:test:{fixture}", 4), "1");
  assert.equal(await grant("spall-resource-open:test:{fixture}", 4), "1");
  assert.equal(await admit("test", 10, 31), "1"); assert.equal(await admit("test", 10, 31), "0");
  assert.equal(await command("HGET", `${prefix("test")}:command`, "count"), "1");
  assert.equal(await command("HGET", `${prefix("test")}:work`, "count"), "31");
  assert.equal(await command("HGET", "spall-click:test:{fixture}:work", "count"), "4");
  assert.equal(await command("HGET", "spall-resource-open:test:{fixture}:work", "count"), "4");
});
test("Redis TIME rollover resets editor counts and both TTLs bound retention", async () => {
  assert.equal(await admit("window", 1, 31, 1000), "1");
  for (const suffix of ["command", "work"]) {
    const ttl = Number(await command("PTTL", `${prefix("window")}:${suffix}`)); assert.ok(ttl > 0 && ttl <= 2000);
  }
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.equal(await admit("window", 1, 31, 1000), "1");
  assert.equal(await command("HGET", `${prefix("window")}:work`, "count"), "31");
});
test("corrupt or wrong-type editor state denies without creating the other counter", async () => {
  for (const [name, values] of [["bad", ["bucket", "bad", "count", 0]], ["partial", ["bucket", 0]],
    ["noncanonical", ["bucket", "00", "count", 0]], ["future", ["bucket", "9007199254740991", "count", 0]]]) {
    await command("HSET", `${prefix(name)}:work`, ...values);
    assert.equal(await admit(name), "0"); assert.equal(await command("EXISTS", `${prefix(name)}:command`), "0");
  }
  await command("SET", `${prefix("wrong")}:work`, "wrong-type");
  assert.match(await admit("wrong"), /WRONGTYPE/); assert.equal(await command("EXISTS", `${prefix("wrong")}:command`), "0");
});
test("future server timestamp denies without changing known editor counts", async () => {
  assert.equal(await admit("clock"), "1");
  const previous = Number(await command("HGET", `${prefix("clock")}:work`, "at"));
  await command("HSET", `${prefix("clock")}:work`, "at", previous + 10000);
  assert.equal(await admit("clock"), "0");
  assert.equal(await command("HGET", `${prefix("clock")}:command`, "count"), "1");
  assert.equal(await command("HGET", `${prefix("clock")}:work`, "count"), "31");
});
