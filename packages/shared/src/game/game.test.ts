import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { type InputFrame, NO_INPUT } from "../input.ts";
import type { Level, LevelObject } from "../level/types.ts";
import type { Vec3 } from "../math.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { tuning } from "../tuning.ts";
import { createGame, type GameState, stepGame } from "./game.ts";

const STAND_Y = tuning.capsule.halfHeight + tuning.capsule.radius;
const FLOOR = { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 60, y: 1, z: 60 }, style: "grass" as const };
const ME = "p1";

function setup(objects: LevelObject[], crystals: Vec3[] = []) {
  const level: Level = {
    name: "t",
    spawn: { x: 0, y: STAND_Y + 0.05, z: 0 },
    solids: [FLOOR],
    objects,
    crystals,
  };
  const world = new PhysicsWorld(level);
  const game = createGame(world, level, [ME]);
  return { level, world, game };
}

function play(world: PhysicsWorld, game: GameState, inputAt: (t: number) => InputFrame, ticks: number) {
  const log: { crystals: number; downed: boolean; y: number; scattered: number; z: number; vz: number }[] =
    [];
  for (let i = 0; i < ticks; i++) {
    stepGame(world, game, { [ME]: inputAt(i) }, SIM_DT);
    const h = game.heroes[ME];
    if (!h) throw new Error("hero missing");
    log.push({
      crystals: h.crystals,
      downed: h.downed > 0,
      y: h.mover.pos.y,
      z: h.mover.pos.z,
      vz: h.mover.vel.z,
      scattered: game.scattered.length,
    });
  }
  return log;
}

const fwd = (t: number): InputFrame => (t < 200 ? { ...NO_INPUT, moveZ: 1 } : NO_INPUT);
const spikesAt = (z: number): LevelObject => ({
  kind: "spikes",
  pos: { x: 0, y: 0, z },
  length: 2,
  width: 4,
  yaw: 0,
});
const row = (n: number, z: number): Vec3[] =>
  Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * 0.3, y: 0.8, z }));

beforeAll(async () => {
  await initPhysics();
});

describe("crystals", () => {
  it("are collected by walking through them", () => {
    const { world, game } = setup([], row(5, 3));
    const log = play(world, game, fwd, 60);
    expect(log.at(-1)?.crystals).toBe(5);
    expect(game.crystals.every((c) => c.taken)).toBe(true);
  });
});

describe("spikes", () => {
  it("a hit throws all crystals out, knocks the hero back and makes it invulnerable", () => {
    const { world, game } = setup([spikesAt(6)], row(5, 2.5));
    const log = play(world, game, (t) => (t < 60 ? { ...NO_INPUT, moveZ: 1 } : NO_INPUT), 61);
    const hitTick = log.findIndex((l, i) => i > 0 && (log[i - 1]?.crystals ?? 0) === 5 && l.crystals === 0);
    expect(hitTick).toBeGreaterThan(0);
    expect(log[hitTick]?.scattered).toBe(5);
    expect(game.heroes[ME]?.invuln).toBeGreaterThan(0);
    expect(log[hitTick]?.downed).toBe(false);
    // Knocked back (moving -Z) by the hit.
    expect(log[hitTick]?.vz ?? 0).toBeLessThan(0);
  });

  it("thrown crystals can be picked up again after a short delay, then vanish", () => {
    const { world, game } = setup([spikesAt(6)], row(5, 2.5));
    // Walk in, get hit, then stand still: some crystals land nearby and can be re-collected.
    play(world, game, (t) => (t < 60 ? { ...NO_INPUT, moveZ: 1 } : NO_INPUT), 60);
    const thrown = game.scattered.length;
    expect(thrown).toBe(5);
    const life = Math.ceil(tuning.scatter.life / SIM_DT);
    play(world, game, () => NO_INPUT, life + 5);
    expect(game.scattered.length).toBe(0);
  });

  it("no second hit while invulnerable", () => {
    const { world, game } = setup([spikesAt(3)], row(3, 1.5));
    const log = play(world, game, () => ({ ...NO_INPUT, moveZ: 1 }), 40);
    const downs = log.filter((l) => l.downed).length;
    expect(downs).toBe(0);
  });

  it("a hit with no crystals downs the hero; solo respawns at the checkpoint", () => {
    const checkpoint: LevelObject = { kind: "checkpoint", pos: { x: 0, y: 0, z: 2 } };
    const { world, game } = setup([checkpoint, spikesAt(6)]);
    const log = play(world, game, (t) => (t < 60 ? { ...NO_INPUT, moveZ: 1 } : NO_INPUT), 200);
    const downTick = log.findIndex((l) => l.downed);
    expect(downTick).toBeGreaterThan(0);
    // While down the hero does not move even with input.
    expect(game.checkpoint.z).toBeCloseTo(2, 5);
    const back = log.findIndex((l, i) => i > downTick && !l.downed);
    expect(back).toBeGreaterThan(downTick);
    expect(log[back]?.z).toBeCloseTo(2, 1);
  });
});

describe("checkpoints and pits", () => {
  it("falling into a pit respawns at the last checkpoint, not the level start", () => {
    const checkpoint: LevelObject = { kind: "checkpoint", pos: { x: 0, y: 0, z: 10 } };
    const { world, game } = setup([checkpoint]);
    // Run past the checkpoint and off the floor edge at z = 30.
    const log = play(world, game, () => ({ ...NO_INPUT, moveZ: 1 }), 400);
    const respawn = log.findIndex((l, i) => i > 0 && (log[i - 1]?.y ?? 0) < -10 && l.y > 0);
    expect(respawn).toBeGreaterThan(0);
    expect(log[respawn]?.z).toBeCloseTo(10, 1);
  });
});
