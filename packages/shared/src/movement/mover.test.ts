import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { type InputFrame, NO_INPUT } from "../input.ts";
import type { Level } from "../level/types.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { createRng } from "../rng.ts";
import { tuning } from "../tuning.ts";
import { createMover, type MoverState, stepMover } from "./mover.ts";
import { runReplay } from "./replay.ts";

const FLOOR = { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 200, y: 1, z: 200 }, style: "grass" as const };
const STAND_Y = tuning.capsule.halfHeight + tuning.capsule.radius; // capsule centre when standing on y = 0

function levelWith(...extra: Level["solids"]): Level {
  return { name: "test", spawn: { x: 0, y: STAND_Y + 0.05, z: 0 }, solids: [FLOOR, ...extra] };
}

function ramp(angleDeg: number, z = 5) {
  const rad = (angleDeg * Math.PI) / 180;
  const len = 8;
  return {
    pos: { x: 0, y: (Math.sin(rad) * len) / 2 - Math.cos(rad) * 0.25, z },
    size: { x: 4, y: 0.5, z: len },
    rot: [-angleDeg, 0, 0] as [number, number, number],
    style: "ramp" as const,
  };
}

function sim(level: Level, input: InputFrame | ((tick: number) => InputFrame), ticks: number) {
  const world = new PhysicsWorld(level);
  const id = world.addCharacter(level.spawn);
  let s: MoverState = createMover(level.spawn);
  const trace: MoverState[] = [];
  for (let i = 0; i < ticks; i++) {
    s = stepMover(world, id, s, typeof input === "function" ? input(i) : input, SIM_DT, level.spawn);
    trace.push(s);
  }
  world.dispose();
  return { s, trace };
}

const fwd: InputFrame = { moveX: 0, moveZ: 1, jump: false };

beforeAll(async () => {
  await initPhysics();
});

describe("ground movement", () => {
  it("lands on the floor and stands still without input", () => {
    const { s } = sim(levelWith(), NO_INPUT, 60);
    expect(s.grounded).toBe(true);
    expect(s.pos.y).toBeCloseTo(STAND_Y, 1);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBe(0);
  });

  it("reaches top speed and never exceeds it on flat ground", () => {
    const { trace } = sim(levelWith(), fwd, 120);
    const speeds = trace.map((t) => Math.hypot(t.vel.x, t.vel.z));
    expect(Math.max(...speeds)).toBeLessThanOrEqual(tuning.move.maxSpeed + 1e-6);
    expect(speeds.at(-1)).toBeCloseTo(tuning.move.maxSpeed, 3);
  });

  it("diagonal input is not faster than straight input", () => {
    const { s } = sim(levelWith(), { moveX: 1, moveZ: 1, jump: false }, 120);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBeCloseTo(tuning.move.maxSpeed, 3);
  });

  it("turns around faster than it accelerates from zero", () => {
    const back: InputFrame = { moveX: 0, moveZ: -1, jump: false };
    const turn = sim(levelWith(), (i) => (i < 90 ? fwd : back), 90 + 120);
    const ticksToReverse = turn.trace.slice(90).findIndex((t) => t.vel.z < 0);
    const ticksToStop = Math.ceil(tuning.move.maxSpeed / tuning.move.accel / SIM_DT);
    expect(ticksToReverse).toBeGreaterThan(0);
    expect(ticksToReverse).toBeLessThan(ticksToStop);
  });

  it("stops without input (friction)", () => {
    const { s } = sim(levelWith(), (i) => (i < 60 ? fwd : NO_INPUT), 120);
    expect(Math.hypot(s.vel.x, s.vel.z)).toBe(0);
  });

  it("loses speed against a wall instead of building it up", () => {
    const wall = { pos: { x: 0, y: 1, z: 4 }, size: { x: 10, y: 2, z: 1 }, style: "block" as const };
    const { s } = sim(levelWith(wall), fwd, 120);
    expect(s.pos.z).toBeLessThan(4);
    expect(Math.abs(s.vel.z)).toBeLessThan(0.5);
  });
});

describe("slopes and steps", () => {
  it("climbs a 15° and a 30° ramp", () => {
    for (const angle of [15, 30]) {
      const { trace } = sim(levelWith(ramp(angle)), fwd, 180);
      const top = Math.max(...trace.map((t) => t.pos.y));
      const rise = Math.sin((angle * Math.PI) / 180) * 8;
      expect(top, `${angle}° ramp`).toBeGreaterThan(STAND_Y + rise * 0.8);
    }
  });

  it("cannot walk up a 50° ramp", () => {
    const { trace } = sim(levelWith(ramp(50)), fwd, 180);
    const top = Math.max(...trace.map((t) => t.pos.y));
    expect(top).toBeLessThan(STAND_Y + 1.5);
  });

  it("is slower going uphill than on flat ground", () => {
    const flat = sim(levelWith(), fwd, 150).s;
    const up = sim(levelWith(ramp(15, 9)), fwd, 150).trace.find((t) => t.pos.z > 8);
    expect(up).toBeDefined();
    expect(Math.hypot(up?.vel.x ?? 0, up?.vel.z ?? 0)).toBeLessThan(Math.hypot(flat.vel.x, flat.vel.z));
  });

  it("steps up a 0.25 m step automatically but not a 0.6 m ledge", () => {
    const step = { pos: { x: 0, y: 0.125, z: 4 }, size: { x: 4, y: 0.25, z: 4 }, style: "step" as const };
    const onStep = sim(levelWith(step), fwd, 90).trace.find((t) => t.pos.z > 3.5);
    expect(onStep?.pos.y ?? 0).toBeGreaterThan(STAND_Y + 0.2);

    const ledge = { pos: { x: 0, y: 0.3, z: 4 }, size: { x: 4, y: 0.6, z: 4 }, style: "block" as const };
    const blocked = sim(levelWith(ledge), fwd, 90).s;
    expect(blocked.pos.z).toBeLessThan(2.2);
  });
});

describe("falling", () => {
  it("respawns after falling off the world", () => {
    const small: Level = {
      name: "island",
      spawn: { x: 0, y: STAND_Y + 0.05, z: 0 },
      solids: [{ pos: { x: 0, y: -0.5, z: 0 }, size: { x: 4, y: 1, z: 4 }, style: "grass" }],
    };
    const { trace } = sim(small, fwd, 240);
    const respawnTick = trace.findIndex((t, i) => i > 0 && (trace[i - 1]?.pos.y ?? 0) < -10 && t.pos.y > 0);
    expect(respawnTick).toBeGreaterThan(0);
    expect(trace[respawnTick]?.pos).toEqual(small.spawn);
  });
});

describe("determinism", () => {
  it("replaying the same inputs gives identical states", () => {
    const rng = createRng(2026);
    const inputs: InputFrame[] = Array.from({ length: 600 }, () => ({
      moveX: rng() * 2 - 1,
      moveZ: rng() * 2 - 1,
      jump: false,
    }));
    const level = levelWith(ramp(15), ramp(30, -8));
    const run = () => {
      const world = new PhysicsWorld(level);
      const id = world.addCharacter(level.spawn);
      const out = runReplay(world, id, {
        start: createMover(level.spawn),
        spawn: level.spawn,
        dt: SIM_DT,
        inputs,
      });
      world.dispose();
      return out;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });
});
