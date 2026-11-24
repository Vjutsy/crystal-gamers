import type { Crystal } from "../crystals.ts";
import type { InputFrame } from "../input.ts";
import type { Checkpoint, Level, Spikes } from "../level/types.ts";
import type { Vec3 } from "../math.ts";
import { createMover, type MoverState, stepMover } from "../movement/mover.ts";
import type { PhysicsWorld } from "../physics/world.ts";
import { tuning } from "../tuning.ts";

/** One player's hero: movement plus everything the game rules track about it. */
export interface HeroState {
  /** Physics body id in the PhysicsWorld. */
  body: number;
  mover: MoverState;
  crystals: number;
  /** Seconds of invulnerability left after a hit. */
  invuln: number;
  /** Seconds left lying down after a hit with no crystals (0 = standing). */
  downed: number;
  /** Where the hero respawns (last checkpoint touched, or the level start). */
  checkpoint: Vec3;
}

/** A crystal thrown out by a hit: flies, bounces, can be caught again, then vanishes. */
export interface Scattered {
  id: number;
  pos: Vec3;
  vel: Vec3;
  age: number;
}

export interface GameState {
  heroes: Record<string, HeroState>;
  crystals: Crystal[];
  scattered: Scattered[];
  nextScatterId: number;
  spawn: Vec3;
}

export type GameEvent =
  | { type: "pickup"; hero: string }
  | { type: "hit"; hero: string; lost: number }
  | { type: "downed"; hero: string }
  | { type: "respawn"; hero: string }
  | { type: "checkpoint"; hero: string };

const STAND = tuning.capsule.halfHeight + tuning.capsule.radius;

export function createGame(world: PhysicsWorld, level: Level, heroIds: string[]): GameState {
  const game: GameState = {
    heroes: {},
    crystals: (level.crystals ?? []).map((pos, id) => ({ id, pos: { ...pos }, taken: false })),
    scattered: [],
    nextScatterId: 1,
    spawn: { ...level.spawn },
  };
  heroIds.forEach((id, i) => {
    addHero(world, game, id, i);
  });
  return game;
}

/** Adds a hero next to the level start (players spread 1.5 m apart). */
export function addHero(world: PhysicsWorld, game: GameState, id: string, slot = 0): HeroState {
  const spawn = { ...game.spawn, x: game.spawn.x + slot * 1.5 };
  const hero: HeroState = {
    body: world.addCharacter(spawn),
    mover: createMover(spawn),
    crystals: 0,
    invuln: 0,
    downed: 0,
    checkpoint: { ...game.spawn },
  };
  game.heroes[id] = hero;
  return hero;
}

export function removeHero(world: PhysicsWorld, game: GameState, id: string) {
  const hero = game.heroes[id];
  if (hero) world.removeCharacter(hero.body);
  delete game.heroes[id];
}

function feet(pos: Vec3): Vec3 {
  return { x: pos.x, y: pos.y - STAND, z: pos.z };
}

function onSpikes(f: Vec3, s: Spikes): boolean {
  if (f.y < s.pos.y - 0.2 || f.y > s.pos.y + 0.4) return false;
  const yaw = (s.yaw * Math.PI) / 180;
  const ax = Math.sin(yaw);
  const az = Math.cos(yaw);
  const dx = f.x - s.pos.x;
  const dz = f.z - s.pos.z;
  return Math.abs(dx * ax + dz * az) <= s.length / 2 && Math.abs(dx * az - dz * ax) <= s.width / 2;
}

function atCheckpoint(f: Vec3, c: Checkpoint): boolean {
  const dx = f.x - c.pos.x;
  const dz = f.z - c.pos.z;
  return dx * dx + dz * dz <= 1.2 * 1.2 && f.y > c.pos.y - 0.5 && f.y < c.pos.y + 2;
}

function near(a: Vec3, b: Vec3, r: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** Throws `count` crystals out of `from`, evenly around a circle (deterministic, no randomness). */
function scatter(game: GameState, from: Vec3, count: number) {
  const n = Math.min(count, tuning.scatter.max);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    game.scattered.push({
      id: game.nextScatterId++,
      pos: { x: from.x, y: from.y + 0.2, z: from.z },
      vel: {
        x: Math.sin(a) * tuning.scatter.speed,
        y: tuning.scatter.up,
        z: Math.cos(a) * tuning.scatter.speed,
      },
      age: 0,
    });
  }
}

/**
 * Advances the whole game by one tick: every hero (in id order, for determinism),
 * then the thrown crystals. Mutates `game` and returns what happened.
 */
export function stepGame(
  world: PhysicsWorld,
  game: GameState,
  inputs: Record<string, InputFrame | undefined>,
  dt: number,
): GameEvent[] {
  const events: GameEvent[] = [];
  const t = tuning;

  for (const id of Object.keys(game.heroes).sort()) {
    const h = game.heroes[id];
    if (!h) continue;

    if (h.downed > 0) {
      h.downed -= dt;
      if (h.downed <= 0) {
        // Solo rule: get up at the checkpoint. (Phase 2: a teammate revives on the spot.)
        h.downed = 0;
        h.mover = createMover(h.checkpoint);
        h.invuln = t.hazards.invulnTime;
        events.push({ type: "respawn", hero: id });
      }
      continue;
    }

    h.invuln = Math.max(0, h.invuln - dt);
    const input = inputs[id];
    const before = h.mover;
    h.mover = stepMover(world, h.body, h.mover, input ?? NO_MOVE, dt, h.checkpoint);
    if (before.pos.y < t.world.killY + 5 && h.mover.pos.y > before.pos.y + 5) {
      events.push({ type: "respawn", hero: id });
    }
    const f = feet(h.mover.pos);

    for (const o of world.objects) {
      if (o.kind === "checkpoint" && atCheckpoint(f, o)) {
        const cp = { x: o.pos.x, y: o.pos.y + STAND + 0.05, z: o.pos.z };
        if (cp.x !== h.checkpoint.x || cp.y !== h.checkpoint.y || cp.z !== h.checkpoint.z) {
          h.checkpoint = cp;
          events.push({ type: "checkpoint", hero: id });
        }
      }
    }

    for (const c of game.crystals) {
      if (!c.taken && near(c.pos, h.mover.pos, t.scatter.pickupRadius)) {
        c.taken = true;
        h.crystals++;
        events.push({ type: "pickup", hero: id });
      }
    }
    game.scattered = game.scattered.filter((c) => {
      if (c.age >= t.scatter.pickupDelay && near(c.pos, h.mover.pos, t.scatter.pickupRadius)) {
        h.crystals++;
        events.push({ type: "pickup", hero: id });
        return false;
      }
      return true;
    });

    if (h.invuln === 0) {
      const spike = world.objects.find((o): o is Spikes => o.kind === "spikes" && onSpikes(f, o));
      if (spike) {
        if (h.crystals > 0) {
          events.push({ type: "hit", hero: id, lost: h.crystals });
          scatter(game, h.mover.pos, h.crystals);
          h.crystals = 0;
          h.invuln = t.hazards.invulnTime;
          // Knock back away from where the hero came from.
          const sp = Math.hypot(h.mover.vel.x, h.mover.vel.z);
          const bx = sp > 0.1 ? -h.mover.vel.x / sp : 0;
          const bz = sp > 0.1 ? -h.mover.vel.z / sp : -1;
          h.mover = {
            ...h.mover,
            vel: { x: bx * t.hazards.knockback, y: t.hazards.knockbackUp, z: bz * t.hazards.knockback },
            grounded: false,
            rolling: false,
            spinCharge: -1,
            jumpCuttable: false,
          };
        } else {
          h.downed = t.hazards.downedTime;
          h.mover = { ...h.mover, vel: { x: 0, y: 0, z: 0 }, rolling: false, spinCharge: -1 };
          events.push({ type: "downed", hero: id });
        }
      }
    }
  }

  // Thrown crystals: simple ballistic flight with bouncy landings.
  for (const c of game.scattered) {
    c.age += dt;
    c.vel.y -= t.air.gravity * dt;
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
    c.pos.z += c.vel.z * dt;
    if (c.vel.y < 0) {
      const ground = world.surfaceBelow({ x: c.pos.x, y: c.pos.y + 0.6, z: c.pos.z }, 1.2);
      if (ground !== null && c.pos.y - 0.3 < ground) {
        c.pos.y = ground + 0.3;
        c.vel.y = -c.vel.y * 0.45;
        c.vel.x *= 0.7;
        c.vel.z *= 0.7;
      }
    }
  }
  game.scattered = game.scattered.filter((c) => c.age < t.scatter.life);
  return events;
}

const NO_MOVE: InputFrame = { moveX: 0, moveZ: 0, jump: false, spin: false };
