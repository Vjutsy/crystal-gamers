import { describe, expect, it } from "vitest";
import { orientLevel, rotateY } from "./orient.ts";
import type { Level } from "./types.ts";

describe("screen-aligned levels", () => {
  it("authored +Z (screen up, W key) becomes the world diagonal +X+Z", () => {
    const p = rotateY({ x: 0, y: 1, z: 10 }, 45);
    expect(p.x).toBeCloseTo(10 * Math.SQRT1_2, 6);
    expect(p.z).toBeCloseTo(10 * Math.SQRT1_2, 6);
    expect(p.y).toBe(1);
  });

  it("authored +X (screen right, D key) becomes the world diagonal +X−Z", () => {
    const p = rotateY({ x: 10, y: 0, z: 0 }, 45);
    expect(p.x).toBeCloseTo(10 * Math.SQRT1_2, 6);
    expect(p.z).toBeCloseTo(-10 * Math.SQRT1_2, 6);
  });

  it("matches the keyboard mapping: W moves along the rotated +Z", () => {
    // Client maps W to world (+1, +1)/√2 — the same direction as authored +Z after orientation.
    const w = rotateY({ x: 0, y: 0, z: 1 }, 45);
    expect(w.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(w.z).toBeCloseTo(Math.SQRT1_2, 6);
  });

  it("rotates solids, boosters and spring pushes consistently", () => {
    const level: Level = {
      name: "t",
      spawn: { x: 0, y: 1, z: 0 },
      solids: [{ pos: { x: 0, y: 0, z: 5 }, size: { x: 1, y: 1, z: 1 }, rot: [-15, 0, 0], style: "ramp" }],
      objects: [
        { kind: "booster", pos: { x: 0, y: 0, z: 5 }, length: 2, width: 2, yaw: 0, speed: 10 },
        { kind: "spring", pos: { x: 0, y: 0, z: 5 }, power: 10, push: { x: 0, z: 4 } },
      ],
    };
    const o = orientLevel(level);
    expect(o.solids[0]?.rot).toEqual([-15, 45, 0]);
    const booster = o.objects?.[0];
    expect(booster?.kind === "booster" && booster.yaw).toBe(45);
    const spring = o.objects?.[1];
    expect(spring?.kind === "spring" && spring.push?.x).toBeCloseTo(4 * Math.SQRT1_2, 6);
  });
});
