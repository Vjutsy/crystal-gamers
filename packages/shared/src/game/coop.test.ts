import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { type InputFrame, NO_INPUT } from "../input.ts";
import type { Level, LevelObject } from "../level/types.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { tuning } from "../tuning.ts";
import { createGame, type GameState, stepGame } from "./game.ts";

const STAND_Y = tuning.capsule.halfHeight + tuning.capsule.radius;
const FLOOR = { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 120, y: 1, z: 120 }, style: "grass" as const };

function setup(objects: LevelObject[], players = ["a", "b"]) {
  const level: Level = { name: "t", spawn: { x: 0, y: STAND_Y + 0.05, z: 0 }, solids: [FLOOR], objects };
  const world = new PhysicsWorld(level);
  const game = createGame(world, level, players);
  return { world, game };
}

type Inputs = Record<string, InputFrame>;
function play(world: PhysicsWorld, game: GameState, inputsAt: (t: number) => Inputs, ticks: number) {
  for (let i = 0; i < ticks; i++) stepGame(world, game, inputsAt(i), SIM_DT);
}

const move = (moveX: number, moveZ: number): InputFrame => ({ ...NO_INPUT, moveX, moveZ });
const press = (p: Partial<InputFrame>): InputFrame => ({ ...NO_INPUT, ...p });
const spikesAt = (x: number, z: number): LevelObject => ({
  kind: "spikes",
  pos: { x, y: 0, z },
  length: 2,
  width: 2,
  yaw: 0,
});

/** Puts hero `id` down by walking it onto spikes at (x, 4) with no crystals. */
function downHero(world: PhysicsWorld, game: GameState, id: string, x: number) {
  const hero = game.heroes[id];
  if (!hero) throw new Error("no hero");
  for (let i = 0; i < 120 && hero.downed === 0; i++) stepGame(world, game, { [id]: move(0, 1) }, SIM_DT);
  expect(hero.downed).toBeGreaterThan(0);
  expect(Math.abs(hero.mover.pos.x - x)).toBeLessThan(1.5);
}

beforeAll(async () => {
  await initPhysics();
});

describe("reviving", () => {
  it("in co-op a downed hero stays down instead of respawning by itself", () => {
    const { world, game } = setup([spikesAt(0, 4)]);
    downHero(world, game, "a", 0);
    play(world, game, () => ({}), Math.ceil((tuning.hazards.downedTime * 3) / SIM_DT));
    expect(game.heroes.a?.downed).toBeGreaterThan(0);
  });

  it("a teammate next to it pressing E gets it up beside the teammate, off the hazard", () => {
    const { world, game } = setup([spikesAt(0, 4)]);
    downHero(world, game, "a", 0);
    // b starts at x = 1.5; walk it straight up (+Z) to stand beside a, just off the spikes.
    play(world, game, (t) => ({ b: t < 22 ? move(0, 1) : NO_INPUT }), 40);
    expect(game.heroes.b?.downed).toBe(0);
    play(world, game, () => ({ b: press({ interact: true }) }), 1);
    const a = game.heroes.a;
    const b = game.heroes.b;
    expect(a?.downed).toBe(0);
    expect(a?.invuln).toBeGreaterThan(0);
    // Gets up where the reviver stands, not back on the spikes (playtest bug, 2026-11-25).
    expect(
      Math.hypot(
        (a?.mover.pos.x ?? 0) - (b?.mover.pos.x ?? 0),
        (a?.mover.pos.z ?? 0) - (b?.mover.pos.z ?? 0),
      ),
    ).toBeLessThan(0.5);
  });

  it("a revived hero standing still does not go down again once invulnerability ends", () => {
    const { world, game } = setup([spikesAt(0, 4)]);
    downHero(world, game, "a", 0);
    play(world, game, (t) => ({ b: t < 22 ? move(0, 1) : NO_INPUT }), 40);
    play(world, game, () => ({ b: press({ interact: true }) }), 1);
    play(world, game, () => ({}), Math.ceil((tuning.coop.reviveInvuln + 1) / SIM_DT));
    expect(game.heroes.a?.downed).toBe(0);
  });

  it("pressing E far away does nothing", () => {
    const { world, game } = setup([spikesAt(0, 4)]);
    downHero(world, game, "a", 0);
    play(world, game, (t) => ({ b: t < 60 ? move(1, -1) : press({ interact: t % 2 === 0 }) }), 90);
    expect(game.heroes.a?.downed).toBeGreaterThan(0);
  });

  it("when everyone is down, all get up at the shared checkpoint", () => {
    const cp: LevelObject = { kind: "checkpoint", pos: { x: 0, y: 0, z: -3 } };
    const { world, game } = setup([cp, spikesAt(0.75, 4)]);
    // Both touch the checkpoint first, then both walk into the spikes until both are down.
    play(world, game, (t): Inputs => (t < 30 ? { a: move(0, -1), b: move(0, -1) } : {}), 60);
    expect(game.checkpoint.z).toBeCloseTo(-3, 3);
    for (let i = 0; i < 200; i++) {
      const a = game.heroes.a;
      const b = game.heroes.b;
      if (a && b && a.downed > 0 && b.downed > 0) break;
      stepGame(world, game, { a: move(0, 1), b: move(-0.15, 1) }, SIM_DT);
    }
    expect(game.heroes.a?.downed).toBeGreaterThan(0);
    expect(game.heroes.b?.downed).toBeGreaterThan(0);
    play(world, game, () => ({}), Math.ceil((tuning.hazards.downedTime + 0.2) / SIM_DT));
    expect(game.heroes.a?.downed).toBe(0);
    expect(game.heroes.b?.downed).toBe(0);
    expect(game.heroes.a?.mover.pos.z).toBeCloseTo(-3, 0);
    expect(game.heroes.b?.mover.pos.z).toBeCloseTo(-3, 0);
  });

  it("a hero alone in the room still gets up by itself (solo rule)", () => {
    const { world, game } = setup([spikesAt(0, 4)], ["a"]);
    downHero(world, game, "a", 0);
    play(world, game, () => ({}), Math.ceil((tuning.hazards.downedTime + 0.2) / SIM_DT));
    expect(game.heroes.a?.downed).toBe(0);
  });
});

describe("shared checkpoints", () => {
  it("touching a checkpoint sets the respawn point for the whole team", () => {
    const cp: LevelObject = { kind: "checkpoint", pos: { x: 0, y: 0, z: 5 } };
    const { world, game } = setup([cp]);
    play(world, game, () => ({ a: move(0, 1) }), 70);
    expect(game.checkpoint.z).toBeCloseTo(5, 3);
  });

  it("pulls teammates who are far behind, leaves nearby ones alone", () => {
    const cp: LevelObject = { kind: "checkpoint", pos: { x: 0, y: 0, z: 30 } };
    const { world, game } = setup([cp], ["a", "b", "c"]);
    // c walks along with a; b stays at the start (30 m behind).
    play(world, game, () => ({ a: move(0, 1), c: move(0, 1) }), 200);
    expect(game.checkpoint.z).toBeCloseTo(30, 3);
    const b = game.heroes.b;
    expect(Math.hypot((b?.mover.pos.x ?? 0) - 0, (b?.mover.pos.z ?? 0) - 30)).toBeLessThan(3);
    const c = game.heroes.c;
    expect(c?.mover.pos.z).toBeGreaterThan(20);
  });
});
