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
test("issue and bundle atomically share request capacity and charge distinct work", async () => {
  assert.equal(await grant("shared", 32, 2), "1"); assert.equal(await grant("shared", 4, 2), "1");
  assert.equal(await grant("shared", 32, 2), "0");
  assert.equal(await command("HGET", "shared:issue", "count"), "2");
  assert.equal(await command("HGET", "shared:work", "count"), "36");
});
test("redemption shares work budget without sharing issue request counter", async () => {
  assert.equal(await grant("work", 32, 10, 35), "1");
  assert.equal(await grant("work", 4, 10, 35), "0");
  assert.equal(await grant("work", 3, 10, 35, 3600000, "redeem"), "1");
  assert.equal(await command("HGET", "work:issue", "count"), "1");
  assert.equal(await command("HGET", "work:work", "count"), "35");
});
test("competing bundle requests never exceed atomic request or work capacity", async () => {
  const results = await Promise.all(Array.from({ length: 24 }, () => grant("race", 32, 20, 96)));
  assert.equal(results.filter(x => x === "1").length, 3); assert.equal(results.filter(x => x === "0").length, 21);
  assert.equal(await command("HGET", "race:issue", "count"), "3");
  assert.equal(await command("HGET", "race:work", "count"), "96");
});
test("server fixed-window rollover resets counts while finite TTL bounds retention", async () => {
  assert.equal(await grant("window", 32, 1, 32, 1000), "1");
  const ttl = Number(await command("PTTL", "window:work")); assert.ok(ttl > 0 && ttl <= 2000);
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.equal(await grant("window", 32, 1, 32, 1000), "1");
  assert.equal(await command("HGET", "window:work", "count"), "32");
});
test("malformed, partial, future or wrong-type counters deny before changing the other counter", async () => {
  for (const [name, values] of [["malformed", ["bucket", "bad", "count", 0]], ["partial", ["bucket", 0]], ["noncanonical", ["bucket", "00", "count", 0]],
    ["future", ["bucket", "9007199254740991", "count", 0]]]) {
    await command("HSET", `${name}:work`, ...values);
    assert.equal(await grant(name, 4), "0"); assert.equal(await command("EXISTS", `${name}:issue`), "0");
  }
  await command("SET", "wrong:work", "wrong-type");
  assert.match(await grant("wrong", 4), /WRONGTYPE/); assert.equal(await command("EXISTS", "wrong:issue"), "0");
});
test("a future stored server timestamp denies instead of resetting counters", async () => {
  assert.equal(await grant("clock", 4), "1");
  const previous = Number(await command("HGET", "clock:work", "at"));
  await command("HSET", "clock:work", "at", previous + 10000);
  assert.equal(await grant("clock", 4), "0");
  assert.equal(await command("HGET", "clock:issue", "count"), "1");
  assert.equal(await command("HGET", "clock:work", "count"), "4");
});
