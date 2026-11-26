import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { HERO_IDS, heroTuning, standHeight } from "../heroes.ts";
import { NO_INPUT } from "../input.ts";
import type { Level } from "../level/types.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { createMover, stepMover } from "./mover.ts";

beforeAll(async () => {
  await initPhysics();
});

// The same staircase as on the test level: three 0.25 m steps up to a 1 m landing.
const STAIRS: Level = {
  name: "stairs",
  spawn: { x: 0, y: 1, z: 0 },
  solids: [
    { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 20, y: 1, z: 30 }, style: "grass" },
    { pos: { x: 0, y: 0.125, z: 4 }, size: { x: 3, y: 0.25, z: 1 }, style: "step" },
    { pos: { x: 0, y: 0.25, z: 5 }, size: { x: 3, y: 0.5, z: 1 }, style: "step" },
    { pos: { x: 0, y: 0.375, z: 6 }, size: { x: 3, y: 0.75, z: 1 }, style: "step" },
    { pos: { x: 0, y: 0.5, z: 8 }, size: { x: 3, y: 1, z: 3 }, style: "step" },
  ],
};

describe("stairs", () => {
  it("every hero walks up the staircase without jumping", () => {
    for (const hero of HERO_IDS) {
      const t = heroTuning(hero);
      const world = new PhysicsWorld(STAIRS);
      const start = { x: 0, y: standHeight(t) + 0.02, z: 0 };
      const body = world.addCharacter(start, t.capsule);
      let s = createMover(start);
      let top = 0;
      // Walk forward until past the top of the stairs (or 4 s), never pressing jump.
      for (let i = 0; i < 240 && s.pos.z < 8; i++) {
        s = stepMover(world, body, s, { ...NO_INPUT, moveZ: 1 }, SIM_DT, start, t);
        top = Math.max(top, s.pos.y - standHeight(t));
      }
      expect(top, `${hero} stopped at z=${s.pos.z.toFixed(2)}`).toBeGreaterThan(0.95);
      world.dispose();
    }
  });
});
