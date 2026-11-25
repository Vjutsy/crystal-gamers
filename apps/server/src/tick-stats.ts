/** Rolling timing of simulation ticks, to check the server keeps up (budget: 1000/60 ≈ 16.7 ms). */
export class TickStats {
  private samples: number[] = [];

  constructor(private readonly size = 600) {}

  add(ms: number) {
    this.samples.push(ms);
    if (this.samples.length > this.size) this.samples.shift();
  }

  summary() {
    const s = [...this.samples].sort((a, b) => a - b);
    if (s.length === 0) return { ticks: 0, avgMs: 0, p99Ms: 0, maxMs: 0 };
    const round = (v: number) => Math.round(v * 1000) / 1000;
    return {
      ticks: s.length,
      avgMs: round(s.reduce((a, b) => a + b, 0) / s.length),
      p99Ms: round(s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] ?? 0),
      maxMs: round(s.at(-1) ?? 0),
    };
  }
}

/** Shared by all rooms on this process; reported by /health. */
export const tickStats = new TickStats();
