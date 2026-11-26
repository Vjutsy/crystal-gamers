import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { type HeroId, heroTuning, standHeight } from "../heroes.ts";
import { type InputFrame, NO_INPUT } from "../input.ts";
import type { Level } from "../level/types.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { createMover, type MoverState, stepMover } from "./mover.ts";

beforeAll(async () => {
  await initPhysics();
});

const FLAT: Level = {
  name: "flat",
  spawn: { x: 0, y: 1, z: 0 },
  solids: [{ pos: { x: 0, y: -0.5, z: 0 }, size: { x: 200, y: 1, z: 200 }, style: "grass" }],
};

/** Runs `hero` on a flat floor; `inputAt(tick)` gives the input. Returns every state. */
function run(hero: HeroId, inputAt: (i: number) => Partial<InputFrame>, ticks: number): MoverState[] {
  const t = heroTuning(hero);
  const world = new PhysicsWorld(FLAT);
  const start = { x: 0, y: standHeight(t) + 0.02, z: 0 };
  const body = world.addCharacter(start, t.capsule);
  let s = createMover(start);
  const out: MoverState[] = [];
  for (let i = 0; i < 10; i++) s = stepMover(world, body, s, NO_INPUT, SIM_DT, start, t);
  for (let i = 0; i < ticks; i++) {
    s = stepMover(world, body, s, { ...NO_INPUT, ...inputAt(i) }, SIM_DT, start, t);
    out.push(s);
  }
  world.dispose();
  return out;
}

const feet = (hero: HeroId, s: MoverState) => s.pos.y - standHeight(heroTuning(hero));
const peak = (hero: HeroId, states: MoverState[]) => Math.max(...states.map((s) => feet(hero, s)));

/** Jump at tick 0 (held 10 ticks), let go, press again at `second` while still in the air. */
const twoPresses = (second: number) => (i: number) => ({ jump: i < 10 || (i >= second && i < second + 12) });

describe("hero movement tricks (SPEC-0003)", () => {
  it("Nevetes: a second press in the air jumps again (once per airtime)", () => {
    const single = peak(
      "nevetes",
      run("nevetes", (i) => ({ jump: i < 10 }), 120),
    );
    const double = peak("nevetes", run("nevetes", twoPresses(20), 120));
    expect(double).toBeGreaterThan(single + 1);
    // A third press does nothing more.
    const triple = peak(
      "nevetes",
      run("nevetes", (i) => ({ jump: i < 10 || (i >= 20 && i < 32) || (i >= 40 && i < 52) }), 140),
    );
    expect(triple).toBeCloseTo(double, 1);
  });

  it("other heroes do not double jump", () => {
    for (const h of ["rubfir", "erl", "emi"] as const) {
      const single = peak(
        h,
        run(h, (i) => ({ jump: i < 12 }), 120),
      );
      const states = run(h, twoPresses(20), 120);
      expect(peak(h, states)).toBeLessThan(single + 0.5);
    }
  });

  it("Erl: a second press in the air dashes in the held direction, without falling", () => {
    const states = run("erl", (i) => ({ ...twoPresses(15)(i), moveZ: i >= 15 ? 1 : 0 }), 60);
    const at = states[15] as MoverState;
    const after = states[24] as MoverState;
    expect(after.pos.z - at.pos.z).toBeGreaterThan(1.8); // ~15 m/s for a moment
    expect(after.pos.y).toBeGreaterThan(at.pos.y - 0.1); // no drop during the dash
  });

  it("Rubfir: a second press in the air slams straight down and reports the landing", () => {
    const states = run("rubfir", (i) => ({ ...twoPresses(18)(i), moveZ: 1 }), 60);
    const slam = states.findIndex((s) => s.pounding);
    expect(slam).toBeGreaterThanOrEqual(18);
    const s = states[slam + 1] as MoverState;
    expect(s.vel.y).toBeLessThan(-20);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBe(0);
    const landed = states.findIndex((x) => x.pounded);
    expect(landed).toBeGreaterThan(slam);
    expect(states[landed]?.grounded).toBe(true);
  });

  it("the trick is ready again after landing", () => {
    const states = run(
      "nevetes",
      (i) => ({ jump: i < 10 || (i >= 20 && i < 32) || (i >= 120 && i < 130) || (i >= 140 && i < 152) }),
      220,
    );
    const firstAir = peak("nevetes", states.slice(0, 110));
    const secondAir = peak("nevetes", states.slice(115));
    expect(secondAir).toBeCloseTo(firstAir, 0);
  });
});
