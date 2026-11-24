import { describe, expect, it } from "vitest";
import {
  collectCrystals,
  createPlayer,
  createRng,
  generateRoomCode,
  NO_INPUT,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
  ringOfCrystals,
  stepPlayer,
  tuning,
} from "./index.ts";

describe("rng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("stays in [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("room codes", () => {
  it("generates valid codes that survive normalisation", () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode(rng);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(normalizeRoomCode(code.toLowerCase())).toBe(code);
    }
  });

  it("rejects look-alike characters and wrong length", () => {
    expect(normalizeRoomCode("AB0D")).toBeNull();
    expect(normalizeRoomCode("ABC")).toBeNull();
    expect(normalizeRoomCode("ab-cd")).toBe("ABCD");
  });
});

describe("crystals", () => {
  it("collects only crystals in reach, once", () => {
    const cs = ringOfCrystals(8, 5);
    expect(collectCrystals({ x: 0, y: 0, z: 0 }, cs)).toEqual([]);
    expect(collectCrystals({ x: 5, y: 0, z: 0 }, cs)).toEqual([0]);
    expect(collectCrystals({ x: 5, y: 0, z: 0 }, cs)).toEqual([]);
  });
});

describe("stepPlayer", () => {
  it("never exceeds max speed, even diagonally", () => {
    let p = createPlayer();
    for (let i = 0; i < 600; i++) p = stepPlayer(p, { moveX: 1, moveZ: 1, jump: false });
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(tuning.move.maxSpeed, 5);
  });

  it("comes to a full stop without input", () => {
    let p = createPlayer();
    for (let i = 0; i < 60; i++) p = stepPlayer(p, { moveX: 1, moveZ: 0, jump: false });
    for (let i = 0; i < 120; i++) p = stepPlayer(p, NO_INPUT);
    expect(p.vel.x).toBe(0);
    expect(p.vel.z).toBe(0);
  });

  it("is deterministic: same inputs give the same position", () => {
    const run = () => {
      let p = createPlayer();
      const rng = createRng(99);
      for (let i = 0; i < 300; i++) {
        p = stepPlayer(p, { moveX: rng() * 2 - 1, moveZ: rng() * 2 - 1, jump: false });
      }
      return p.pos;
    };
    expect(run()).toEqual(run());
  });
});
