import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { type InputFrame, NO_INPUT } from "../input.ts";
import type { Level, LevelObject } from "../level/types.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { tuning } from "../tuning.ts";
import { createMover, type MoverState, stepMover } from "./mover.ts";

const STAND_Y = tuning.capsule.halfHeight + tuning.capsule.radius;
const FLOOR = { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 300, y: 1, z: 300 }, style: "grass" as const };

function level(objects: LevelObject[] = []): Level {
  return { name: "t", spawn: { x: 0, y: STAND_Y + 0.05, z: 0 }, solids: [FLOOR], objects };
}

function run(lvl: Level, inputAt: (tick: number) => InputFrame, ticks: number): MoverState[] {
  const world = new PhysicsWorld(lvl);
  const id = world.addCharacter(lvl.spawn);
  let s = createMover(lvl.spawn);
  const trace: MoverState[] = [];
  for (let i = 0; i < ticks; i++) {
    s = stepMover(world, id, s, inputAt(i), SIM_DT, lvl.spawn);
    trace.push(s);
  }
  world.dispose();
  return trace;
}

const input = (p: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...p });
const speed = (s: MoverState | undefined) => Math.hypot(s?.vel.x ?? 0, s?.vel.z ?? 0);
const ticks = (seconds: number) => Math.round(seconds / SIM_DT);

/** Settle 20 ticks, face +X with a short tap, then hold spin for `hold` s, then release. */
function spinDash(hold: number) {
  const settle = 20;
  const face = 2;
  const holdTicks = ticks(hold);
  return run(
    level(),
    (i) => {
      if (i < settle) return NO_INPUT;
      if (i < settle + face) return input({ moveX: 1 });
      if (i < settle + face + holdTicks) return input({ spin: true });
      return NO_INPUT;
    },
    settle + face + holdTicks + 300,
  ).slice(settle + face);
}

beforeAll(async () => {
  await initPhysics();
});

describe("spin dash", () => {
  it("holding spin keeps the hero in place while charging", () => {
    const trace = spinDash(1);
    const charging = trace.slice(10, ticks(1));
    for (const s of charging) expect(speed(s)).toBeLessThan(0.05);
    expect(charging.at(-1)?.spinCharge).toBeGreaterThan(0.8);
  });

  it("releasing dashes faster than top running speed, in the facing direction", () => {
    const trace = spinDash(1);
    const after = trace[ticks(1) + 1];
    expect(speed(after)).toBeGreaterThan(tuning.move.maxSpeed + tuning.spinDash.boost3 * 0.9);
    expect(after?.vel.x).toBeGreaterThan(0);
    expect(Math.abs(after?.vel.z ?? 1)).toBeLessThan(0.01);
    expect(after?.rolling).toBe(true);
  });

  it("a longer charge gives a stronger dash", () => {
    const short = spinDash(0.1);
    const long = spinDash(1);
    expect(speed(short[ticks(0.1) + 1])).toBeLessThan(speed(long[ticks(1) + 1]));
  });

  it("the dash carries for a while without input, then settles back", () => {
    const trace = spinDash(1);
    const release = ticks(1);
    expect(speed(trace[release + 30])).toBeGreaterThan(tuning.move.maxSpeed); // still fast 0.5 s later
    expect(trace.at(-1)?.rolling).toBe(false);
  });

  it("charging brakes a running hero", () => {
    const trace = run(level(), (i) => (i < 90 ? input({ moveZ: 1 }) : input({ spin: true })), 150);
    expect(speed(trace[89])).toBeGreaterThan(tuning.move.maxSpeed * 0.9);
    expect(speed(trace.at(-1))).toBeLessThan(0.05);
  });
});

describe("springs", () => {
  it("a spring under the hero launches it to about power² / 2g", () => {
    const power = 18;
    const trace = run(
      level([{ kind: "spring", pos: { x: 0, y: 0, z: 3 }, power }]),
      () => input({ moveZ: 1 }),
      150,
    );
    const peak = Math.max(...trace.map((t) => t.pos.y)) - STAND_Y;
    const expected = power ** 2 / (2 * tuning.air.gravity);
    expect(peak).toBeGreaterThan(expected * 0.85);
    expect(peak).toBeLessThan(expected * 1.15);
  });

  it("a diagonal spring also pushes sideways", () => {
    const spring: LevelObject = {
      kind: "spring",
      pos: { x: 0, y: 0, z: 3 },
      power: 14,
      push: { x: 8, z: 0 },
    };
    const trace = run(level([spring]), (i) => (i < 30 ? input({ moveZ: 1 }) : NO_INPUT), 120);
    const launched = trace.find((t) => t.vel.y > 10);
    expect(launched?.vel.x).toBeGreaterThan(7);
  });

  it("does nothing when the hero is not touching it", () => {
    const trace = run(
      level([{ kind: "spring", pos: { x: 5, y: 0, z: 5 }, power: 18 }]),
      () => input({ moveZ: 1 }),
      90,
    );
    expect(Math.max(...trace.map((t) => t.pos.y))).toBeLessThan(STAND_Y + 0.1);
  });
});

describe("boosters", () => {
  it("sets running speed along the booster's direction", () => {
    // Booster pointing +X (yaw 90) right in front of the hero on its way along +Z.
    const booster: LevelObject = {
      kind: "booster",
      pos: { x: 0, y: 0, z: 3 },
      length: 2,
      width: 2,
      yaw: 90,
      speed: 20,
    };
    const trace = run(level([booster]), (i) => (i < 25 ? input({ moveZ: 1 }) : NO_INPUT), 60);
    const boosted = trace.find((t) => t.vel.x > 19);
    expect(boosted).toBeDefined();
    expect(boosted?.rolling).toBe(false);
  });
});
