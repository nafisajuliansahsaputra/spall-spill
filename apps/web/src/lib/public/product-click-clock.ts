import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const safeTime = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const validCounter = (value: number) => Number.isFinite(value) && value >= 0;

/** Private staged primitive; future assembly must calibrate separately for each operation. */
export async function readProductClickClock(client: Pick<SupabaseClient, "schema">, monotonic = () => performance.now()): Promise<{
  lowerNow(): number;
  upperNow(): number;
} | null> {
  try {
    const started = monotonic();
    if (!validCounter(started)) return null;
    const { data, error } = await client.schema("api").rpc("read_product_click_clock_server")
      .abortSignal(AbortSignal.timeout(5_000));
    const received = monotonic();
    const duration = received - started;
    if (error !== null || !safeTime(data) || !validCounter(received)
      || duration < 0 || duration > 5_000) return null;
    const upper = data + Math.ceil(duration) + 1;
    if (!safeTime(upper)) return null;
    let previous = received;
    let invalid = false;
    function current(round: (value: number) => number, anchor: number) {
      try {
        const counter = monotonic();
        if (invalid || !validCounter(counter) || counter < previous) { invalid = true; return NaN; }
        previous = counter;
        const result = anchor + round(counter - received);
        if (!safeTime(result)) { invalid = true; return NaN; }
        return result;
      } catch { invalid = true; return NaN; }
    }
    return { lowerNow: () => current(Math.floor, data), upperNow: () => current(Math.ceil, upper) };
  } catch { return null; }
}
