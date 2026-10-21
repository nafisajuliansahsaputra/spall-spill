import { afterEach, expect, expectTypeOf, it, vi } from "vitest";
import { identityTextEditorBudgetPolicySchema as schema, identityTextEditorCommandWorkCost as cost, type IdentityTextEditorBudgetPolicy } from "./identity-text-editor-budget-policy";

const policy = { namespace: "text-test", window_ms: 60000, command_limit: 10, work_limit: 130 };
afterEach(() => vi.restoreAllMocks());
it("requires explicit conservative13 RPC units for any Text command without I/O", () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected I/O"));
  const uuid = vi.spyOn(globalThis.crypto, "randomUUID");
  expect(cost).toBe(13); expect(schema.parse({ ...policy, work_limit: cost })).toEqual({ ...policy, work_limit: 13 });
  expect(fetcher).not.toHaveBeenCalled(); expect(uuid).not.toHaveBeenCalled();
});
it.each([
  { namespace: "a", window_ms: 1000, command_limit: 1, work_limit: 13 },
  { namespace: "a".repeat(48), window_ms: 3600000, command_limit: 1000000, work_limit: 1000000 },
  { namespace: "text-editor-1", window_ms: 1000, command_limit: 2, work_limit: 26 },
])("accepts bounded explicit policy %j", value => { expect(schema.parse(value)).toEqual(value); });
it.each([null, undefined, [], {}, "text", 13, false])("does not invent a default policy for %j", value => {
  expect(schema.safeParse(value).success).toBe(false);
});
it.each(["", "A", "1text", "_text", "text_test", "bad{}", "text:other", "text\u0000raw", " text", "text ", "a".repeat(49), null, undefined])("rejects namespace %j", namespace => {
  expect(schema.safeParse({ ...policy, namespace }).success).toBe(false);
});
for (const field of ["window_ms", "command_limit", "work_limit"] as const) {
  it.each([null, undefined, "13", false, 0, -1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(`rejects malformed ${field} %j without coercion`, value => {
    expect(schema.safeParse({ ...policy, [field]: value }).success).toBe(false);
  });
  it(`rejects missing ${field}`, () => { const value: Record<string, unknown> = { ...policy }; delete value[field]; expect(schema.safeParse(value).success).toBe(false); });
}
it.each([{ window_ms: 999 }, { window_ms: 3600001 }, { command_limit: 1000001 }, { work_limit: 12 }, { work_limit: 1000001 }])("rejects out-of-bound limits %j", patch => {
  expect(schema.safeParse({ ...policy, ...patch }).success).toBe(false);
});
it.each(["action", "body", "owner_id", "client", "key", "domain", "redis", "capacity_boost", "fallback"])("rejects authority/default override %s", field => {
  expect(schema.safeParse({ ...policy, [field]: "forged" }).success).toBe(false);
});
it("returns independent parsed policy without changing caller rates", () => {
  const input = { ...policy }, parsed = schema.parse(input); input.work_limit = 1000000; parsed.namespace = "changed";
  expect(parsed.work_limit).toBe(130); expect(input.namespace).toBe("text-test"); expect(schema.parse(policy)).toEqual(policy);
  expectTypeOf<IdentityTextEditorBudgetPolicy>().toEqualTypeOf<{ namespace: string; window_ms: number; command_limit: number; work_limit: number }>();
});
