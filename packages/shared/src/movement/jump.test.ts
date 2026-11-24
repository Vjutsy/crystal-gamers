import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { type InputFrame, NO_INPUT } from "../input.ts";
import type { Level } from "../level/types.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { tuning } from "../tuning.ts";
import { createMover, type MoverState, stepMover } from "./mover.ts";

const STAND_Y = tuning.capsule.halfHeight + tuning.capsule.radius;
const FLOOR = { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 200, y: 1, z: 200 }, style: "grass" as const };

function run(level: Level, inputAt: (tick: number) => InputFrame, ticks: number): MoverState[] {
  const world = new PhysicsWorld(level);
  const id = world.addCharacter(level.spawn);
  let s = createMover(level.spawn);
  const trace: MoverState[] = [];
  for (let i = 0; i < ticks; i++) {
    s = stepMover(world, id, s, inputAt(i), SIM_DT, level.spawn);
    trace.push(s);
  }
  world.dispose();
  return trace;
}

const flat: Level = { name: "flat", spawn: { x: 0, y: STAND_Y + 0.05, z: 0 }, solids: [FLOOR] };
const jump = (on: boolean, moveZ = 0): InputFrame => ({ moveX: 0, moveZ, jump: on });
const peak = (trace: MoverState[]) => Math.max(...trace.map((t) => t.pos.y)) - STAND_Y;

/** Settle on the ground for 20 ticks, then apply `then` from tick 20 on. */
const settled = (then: (t: number) => InputFrame) => (i: number) => (i < 20 ? NO_INPUT : then(i - 20));

beforeAll(async () => {
  await initPhysics();
});

describe("jump", () => {
  it("a full jump reaches roughly v²/2g", () => {
    const trace = run(
      flat,
      settled(() => jump(true)),
      120,
    );
    const expected = tuning.jump.velocity ** 2 / (2 * tuning.air.gravity);
    expect(peak(trace)).toBeGreaterThan(expected * 0.9);
    expect(peak(trace)).toBeLessThan(expected * 1.1);
  });

  it("a short tap jumps noticeably lower than holding", () => {
    const tap = peak(
      run(
        flat,
        settled((t) => jump(t < 3)),
        120,
      ),
    );
    const hold = peak(
      run(
        flat,
        settled(() => jump(true)),
        120,
      ),
    );
    expect(tap).toBeLessThan(hold * 0.6);
    expect(tap).toBeGreaterThan(0.3);
  });

  it("holding the button does not bunny-hop: a new press is needed", () => {
    const trace = run(
      flat,
      settled(() => jump(true)),
      240,
    );
    const takeoffs = trace.filter((t, i) => i > 0 && trace[i - 1]?.grounded && !t.grounded && t.vel.y > 0);
    expect(takeoffs).toHaveLength(1);
  });

  it("lands back on the ground", () => {
    const trace = run(
      flat,
      settled((t) => jump(t < 30)),
      180,
    );
    expect(trace.at(-1)?.grounded).toBe(true);
    expect(trace.at(-1)?.pos.y).toBeCloseTo(STAND_Y, 1);
  });

  it("can jump onto a 0.6 m ledge it cannot walk up", () => {
    const ledge = { pos: { x: 0, y: 0.3, z: 6 }, size: { x: 4, y: 0.6, z: 9 }, style: "block" as const };
    const level: Level = { ...flat, solids: [FLOOR, ledge] };
    const trace = run(
      level,
      settled((t) => jump(t >= 5 && t < 25, 1)),
      150,
    );
    const onTop = trace.find((t) => t.grounded && t.pos.y > STAND_Y + 0.5);
    expect(onTop).toBeDefined();
  });
});

describe("coyote time and jump buffer", () => {
  // A platform that ends at z = 2; running forward walks off its edge.
  const platform: Level = {
    name: "edge",
    spawn: { x: 0, y: 3 + STAND_Y + 0.05, z: 0 },
    solids: [
      { pos: { x: 0, y: 2.5, z: -3 }, size: { x: 4, y: 1, z: 10 }, style: "block" },
      { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 200, y: 1, z: 200 }, style: "grass" },
    ],
  };
  const forward = { moveX: 0, moveZ: 1, jump: false };

  function jumpAfterLeavingEdge(ticksLate: number): boolean {
    const world = new PhysicsWorld(platform);
    const id = world.addCharacter(platform.spawn);
    let s = createMover(platform.spawn);
    let leftAt = -1;
    let jumped = false;
    for (let i = 0; i < 200; i++) {
      const wasGrounded = s.grounded;
      const pressing = leftAt >= 0 && i >= leftAt + ticksLate && i < leftAt + ticksLate + 10;
      s = stepMover(world, id, s, { ...forward, jump: pressing }, SIM_DT, platform.spawn);
      if (i > 20 && wasGrounded && !s.grounded && leftAt < 0) leftAt = i;
      if (pressing && s.vel.y > 1) jumped = true;
    }
    world.dispose();
    return jumped;
  }

  it("still jumps a few ticks after running off an edge", () => {
    expect(jumpAfterLeavingEdge(3)).toBe(true);
  });

  it("does not jump long after leaving the edge", () => {
    const late = Math.ceil(tuning.jump.coyoteTime / SIM_DT) + 4;
    expect(jumpAfterLeavingEdge(late)).toBe(false);
  });

  it("a press shortly before landing jumps on landing", () => {
    // Fall from a height, press jump just before touching the ground, release immediately.
    const drop: Level = { ...flat, spawn: { x: 0, y: STAND_Y + 3, z: 0 } };
    const world = new PhysicsWorld(drop);
    const id = world.addCharacter(drop.spawn);
    let s = createMover(drop.spawn);
    let landedAt = -1;
    const states: MoverState[] = [];
    // First find the landing tick without pressing.
    for (let i = 0; i < 120 && landedAt < 0; i++) {
      s = stepMover(world, id, s, NO_INPUT, SIM_DT, drop.spawn);
      if (s.grounded) landedAt = i;
    }
    expect(landedAt).toBeGreaterThan(0);
    s = createMover(drop.spawn);
    const pressFrom = landedAt - 3;
    for (let i = 0; i < 60; i++) {
      s = stepMover(world, id, s, jump(i >= pressFrom && i < pressFrom + 2), SIM_DT, drop.spawn);
      states.push(s);
    }
    world.dispose();
    // The button was released, so this is a short hop — but it must take off.
    const bounced = states.slice(landedAt).some((t) => t.vel.y > 1);
    expect(bounced).toBe(true);
  });
});
