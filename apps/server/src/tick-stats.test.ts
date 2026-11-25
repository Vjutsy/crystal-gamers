import { describe, expect, it } from "vitest";
import { TickStats } from "./tick-stats.ts";

describe("TickStats", () => {
  it("summarises the last N samples", () => {
    const t = new TickStats(4);
    for (const v of [100, 1, 2, 3, 4]) t.add(v); // 100 falls out of the window
    expect(t.summary()).toEqual({ ticks: 4, avgMs: 2.5, p99Ms: 4, maxMs: 4 });
  });

  it("is empty-safe", () => {
    expect(new TickStats().summary().ticks).toBe(0);
  });
});
