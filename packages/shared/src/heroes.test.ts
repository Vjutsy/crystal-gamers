import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "./constants.ts";
import { type HeroId, heroes, heroTuning, MIN_BODY_RADIUS, standHeight } from "./heroes.ts";
import { NO_INPUT } from "./input.ts";
import type { Level } from "./level/types.ts";
import { createMover, type MoverState, stepMover } from "./movement/mover.ts";
import { initPhysics, PhysicsWorld } from "./physics/world.ts";

const FLOOR = { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 400, y: 1, z: 400 }, style: "grass" as const };
const LEVEL: Level = { name: "flat", spawn: { x: 0, y: 1, z: 0 }, solids: [FLOOR] };

beforeAll(async () => {
  await initPhysics();
});

/** Runs one hero on a flat floor; returns numbers that describe how it moves. */
function measure(hero: HeroId) {
  const t = heroTuning(hero);
  const world = new PhysicsWorld(LEVEL);
  const start = { x: 0, y: standHeight(t) + 0.02, z: -150 };
  const body = world.addCharacter(start, t.capsule);
  let s: MoverState = createMover(start);
  const step = (moveZ: number, jump = false) => {
    s = stepMover(world, body, s, { ...NO_INPUT, moveZ, jump }, SIM_DT, start, t);
  };
  for (let i = 0; i < 10; i++) step(0); // settle on the floor
  let ticksTo8 = 0;
  while (Math.hypot(s.vel.x, s.vel.z) < 8 * 0.86 && ticksTo8 < 600) {
    step(1);
    ticksTo8++;
  }
  for (let i = 0; i < 180; i++) step(1);
  const topSpeed = Math.hypot(s.vel.x, s.vel.z);
  // Running jump with the button held: peak height and distance until landing.
  const z0 = s.pos.z;
  const y0 = s.pos.y;
  let peak = 0;
  step(1, true);
  for (let i = 0; i < 300 && !s.grounded; i++) {
    step(1, true);
    peak = Math.max(peak, s.pos.y - y0);
  }
  world.dispose();
  return {
    height: 2 * standHeight(t),
    topSpeed,
    accelTicks: ticksTo8,
    jumpHeight: peak,
    jumpLength: s.pos.z - z0,
  };
}

describe("heroes move according to their build (SPEC-0003)", () => {
  const m = {} as Record<HeroId, ReturnType<typeof measure>>;
  beforeAll(() => {
    for (const h of ["rubfir", "nevetes", "erl", "emi"] as const) m[h] = measure(h);
  });

  it("are as tall as on the sketch: Rubfir > Erl > Emi > Nevetes", () => {
    expect(m.rubfir.height).toBeGreaterThan(m.erl.height);
    expect(m.erl.height).toBeGreaterThan(m.emi.height);
    expect(m.emi.height).toBeGreaterThan(m.nevetes.height);
  });

  it("Rubfir is fastest on the ground, Nevetes slowest", () => {
    const speeds = Object.values(m).map((x) => x.topSpeed);
    expect(m.rubfir.topSpeed).toBe(Math.max(...speeds));
    expect(m.nevetes.topSpeed).toBe(Math.min(...speeds));
  });

  it("Nevetes gets going quickest, Emi slowest", () => {
    const t = Object.values(m).map((x) => x.accelTicks);
    expect(m.nevetes.accelTicks).toBe(Math.min(...t));
    expect(m.emi.accelTicks).toBe(Math.max(...t));
  });

  it("Erl jumps highest and longest, Rubfir lowest", () => {
    const heights = Object.values(m).map((x) => x.jumpHeight);
    const lengths = Object.values(m).map((x) => x.jumpLength);
    expect(m.erl.jumpHeight).toBe(Math.max(...heights));
    expect(m.erl.jumpLength).toBe(Math.max(...lengths));
    expect(m.rubfir.jumpHeight).toBe(Math.min(...heights));
  });

  it("everyone can still clear a 1.4 m step (the test level's highest jump-up)", () => {
    for (const x of Object.values(m)) expect(x.jumpHeight).toBeGreaterThan(1.4);
  });

  it("no physics body is thinner than stairs allow", () => {
    for (const h of Object.values(heroes)) expect(h.capsule.radius).toBeGreaterThanOrEqual(MIN_BODY_RADIUS);
  });

  it("Emi and Rubfir are knocked back least; Emi's spin dash is strongest", () => {
    const kb = (h: HeroId) => heroTuning(h).hazards.knockback;
    expect(kb("emi")).toBeLessThan(kb("rubfir"));
    expect(kb("rubfir")).toBeLessThan(kb("erl"));
    expect(heroTuning("emi").spinDash.boost3).toBeGreaterThan(heroTuning("nevetes").spinDash.boost3);
  });
});
