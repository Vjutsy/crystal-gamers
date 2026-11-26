import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { HERO_IDS, heroTuning, standHeight } from "../heroes.ts";
import { NO_INPUT } from "../input.ts";
import { testLevel } from "../level/test-level.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { type Tuning, tuning } from "../tuning.ts";
import { createMover, stepMover } from "./mover.ts";

beforeAll(async () => {
  await initPhysics();
});

/** Lowest feet height while standing still for `seconds` at (x, z) on the test level floor (top at y = 0). */
function lowestFeet(t: Tuning, x: number, z: number, seconds = 50): number {
  const world = new PhysicsWorld(testLevel);
  const start = { x, y: standHeight(t) + 0.1, z };
  const body = world.addCharacter(start, t.capsule);
  let s = createMover(start);
  let low = Number.POSITIVE_INFINITY;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    s = stepMover(world, body, s, NO_INPUT, SIM_DT, start, t);
    if (i > 60) low = Math.min(low, s.pos.y - standHeight(t));
  }
  world.dispose();
  return low;
}

describe("standing still", () => {
  // Rapier's snap-to-ground sometimes pulls an idle capsule into the floor, at spots that depend
  // on its exact size (found in SPEC-0003 playtesting: Rubfir sank at the spawn point, and the
  // default capsule fell through the floor at (1.5, 0) after ~50 s).
  it("never sinks into the floor, for any hero at the known bad spots", () => {
    const spots: [number, number][] = [
      [0, 0],
      [1.5, 0],
      [4.5, 0],
      [12.3, 0],
    ];
    for (const t of [tuning, ...HERO_IDS.map(heroTuning)]) {
      for (const [x, z] of spots) expect(lowestFeet(t, x, z)).toBeGreaterThan(-0.005);
    }
  });
});
