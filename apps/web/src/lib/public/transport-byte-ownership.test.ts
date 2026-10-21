import { expect, it, vi } from "vitest";
import { productClickBudgetScript } from "./product-click-budget";
import { createProductClickUpstashBudgetTransport } from "./product-click-budget-upstash";
import { createResourceOpenUpstashBudgetTransport } from "./resource-open-budget-upstash";
import { readProductClickRequest, readProductClickFormRequest } from "./product-click-request";
import { readResourceOpenRequest, readResourceOpenFormRequest } from "./resource-open-request";

const origin = "https://app.example.test";
const config = { origin: "https://budget-fixture.upstash.io", namespace: "test", token: "test-only-bearer-placeholder" };
function producerStream(original: string, replacement: string | null) {
  const producer = Buffer.from(original); let pulls = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (pulls++ === 0) { controller.enqueue(producer); return; }
    if (replacement === null) producer.fill(255);
    else { expect(Buffer.byteLength(replacement)).toBe(producer.length); producer.set(Buffer.from(replacement)); }
    controller.close();
  } }, { highWaterMark: 0 });
  return { body, length: producer.length, pulls: () => pulls };
}
for (const [name, factory, prefix, cost] of [
  ["Product", createProductClickUpstashBudgetTransport, "spall-click", "32"],
  ["Resource", createResourceOpenUpstashBudgetTransport, "spall-resource-open", "4"],
] as const) {
  it.each([[0, 1], [1, 0], [1, null]] as const)(`${name} budget owns Buffer response before producer mutation %s → %s`, async (original, changed) => {
    const stream = producerStream(JSON.stringify({ result: original }), changed === null ? null : JSON.stringify({ result: changed }));
    const fetcher = vi.fn<typeof fetch>(async () => new Response(stream.body, { headers: {
      "content-type": "application/json", "content-length": String(stream.length),
    } }));
    const base = `${prefix}:test:{${"a".repeat(64)}}`;
    expect(await factory(config, fetcher).eval(productClickBudgetScript, [`${base}:issue`, `${base}:work`], ["60000", "10", "100", cost])).toBe(original);
    expect(stream.pulls()).toBe(2); expect(fetcher).toHaveBeenCalledTimes(1);
  });
}
const token = Buffer.alloc(32, 7).toString("base64url"); // Canonical isolated fixture only.
for (const kind of ["Product JSON", "Resource JSON", "Product native", "Resource native"] as const) {
  it.each(["reference", "invalid UTF8"] as const)(`${kind} owns Buffer request before producer %s mutation`, async mutation => {
    const native = kind.endsWith("native"), resource = kind.startsWith("Resource");
    const original = native ? `handle=creator&spill_reference=27&${resource ? "" : "provider_key=shopee&"}token=${token}`
      : JSON.stringify(resource ? { handle: "creator", reference: "27" } : { handle: "creator", spill_reference: 27 });
    const stream = producerStream(original, mutation === "reference" ? original.replace("27", "28") : null);
    const req = new Request(`${origin}/staged`, { method: "POST", body: stream.body, duplex: "half", headers: {
      origin, "content-type": native ? "application/x-www-form-urlencoded" : "application/json", "content-length": String(stream.length),
    } } as RequestInit);
    const permit = vi.fn(async () => true);
    const result = resource ? native ? await readResourceOpenFormRequest(req, origin, permit) : await readResourceOpenRequest(req, origin, "issue", permit)
      : native ? await readProductClickFormRequest(req, origin, permit) : await readProductClickRequest(req, origin, "issue", permit);
    expect(result).toEqual(native ? { handle: "creator", spill_reference: 27, ...(resource ? {} : { provider_key: "shopee" }), token }
      : resource ? { handle: "creator", reference: "27" } : { handle: "creator", spill_reference: 27 });
    expect(stream.pulls()).toBe(2); expect(permit).toHaveBeenCalledTimes(1);
    expect(req.body?.locked).toBe(false);
    expect(permit.mock.calls[0]).toEqual(resource ? [req, native ? "redeem" : "issue"] : [native ? "redeem" : "issue"]);
  });
}
