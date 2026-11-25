import { describe, expect, it } from "vitest";
import { CorrectionSmoother, SampleBuffer } from "./interpolation.ts";

const p = (x: number) => ({ x, y: 0, z: 0 });

describe("SampleBuffer", () => {
  it("interpolates between surrounding samples", () => {
    const b = new SampleBuffer();
    b.push({ t: 0, pos: p(0) });
    b.push({ t: 50, pos: p(10) });
    b.push({ t: 100, pos: p(20) });
    expect(b.sample(25)?.x).toBeCloseTo(5);
    expect(b.sample(75)?.x).toBeCloseTo(15);
  });

  it("never extrapolates past the newest sample", () => {
    const b = new SampleBuffer();
    b.push({ t: 0, pos: p(0) });
    b.push({ t: 50, pos: p(10) });
    expect(b.sample(500)?.x).toBe(10);
    expect(b.sample(-10)?.x).toBe(0);
  });

  it("ignores out-of-order samples", () => {
    const b = new SampleBuffer();
    b.push({ t: 100, pos: p(10) });
    b.push({ t: 50, pos: p(99) });
    expect(b.sample(100)?.x).toBe(10);
  });

  it("is empty until the first sample", () => {
    expect(new SampleBuffer().sample(0)).toBeNull();
  });
});

describe("CorrectionSmoother", () => {
  it("hides a small correction and fades it out", () => {
    const s = new CorrectionSmoother();
    s.correct(p(1), p(0.8));
    expect(s.offset.x).toBeCloseTo(0.2);
    for (let i = 0; i < 60; i++) s.decay(1 / 60);
    expect(Math.abs(s.offset.x)).toBeLessThan(0.001);
  });

  it("snaps on big jumps (respawn, pull to checkpoint)", () => {
    const s = new CorrectionSmoother();
    s.correct(p(0), p(30));
    expect(s.offset.x).toBe(0);
  });
});
