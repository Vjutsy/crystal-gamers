import { describe, expect, it } from "vitest";
import {
  collectCrystals,
  createRng,
  generateRoomCode,
  normalizeRoomCode,
  ROOM_CODE_LENGTH,
  ringOfCrystals,
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
