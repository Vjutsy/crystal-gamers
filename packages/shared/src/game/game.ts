import type { Crystal } from "../crystals.ts";
import { HERO_IDS, type HeroId, heroTuning, standHeight } from "../heroes.ts";
import type { InputFrame } from "../input.ts";
import type { Checkpoint, Level, Spikes } from "../level/types.ts";
import type { Vec3 } from "../math.ts";
import { createMover, type MoverState, stepMover } from "../movement/mover.ts";
import type { PhysicsWorld } from "../physics/world.ts";
import { type Tuning, tuning } from "../tuning.ts";

/** One player's hero: movement plus everything the game rules track about it. */
export interface HeroState {
  /** Which of the four heroes this is (body, movement, weapon). */
  hero: HeroId;
  /** Physics body id in the PhysicsWorld. */
  body: number;
  mover: MoverState;
  crystals: number;
  /** Seconds of invulnerability left after a hit. */
  invuln: number;
  /**
   * > 0 while lying down after a hit with no crystals (0 = standing).
   * Counts down; in co-op it stops at a tiny value until a teammate revives the hero
   * or the whole team is down.
   */
  downed: number;
  /** Interact button state on the previous tick, to detect new presses. */
  interactHeld: boolean;
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
  /** Level start, at feet level (heroes differ in height, so points are kept at the feet). */
  spawn: Vec3;
  /** Shared respawn point of the whole team (last checkpoint anyone touched), at feet level. */
  checkpoint: Vec3;
}

export type GameEvent =
  | { type: "pickup"; hero: string }
  | { type: "hit"; hero: string; lost: number }
  | { type: "downed"; hero: string }
  | { type: "respawn"; hero: string }
  | { type: "revive"; hero: string; by: string }
  | { type: "pulled"; hero: string }
  | { type: "checkpoint"; hero: string }
  | { type: "pound"; hero: string };

/** Capsule centre for a hero standing with its feet at `feet`. */
export function centerAt(feet: Vec3, t: Tuning): Vec3 {
  return { x: feet.x, y: feet.y + standHeight(t), z: feet.z };
}

/** Default hero for a slot when none was chosen (tests, solo). */
export function heroForSlot(slot: number): HeroId {
  return HERO_IDS[slot % HERO_IDS.length] ?? "rubfir";
}

export function createGame(
  world: PhysicsWorld,
  level: Level,
  playerIds: string[],
  heroIds: HeroId[] = [],
): GameState {
  // Level spawns are authored for the default capsule; keep the feet point.
  const spawnFeet = { ...level.spawn, y: level.spawn.y - standHeight(tuning) };
  const game: GameState = {
    heroes: {},
    crystals: (level.crystals ?? []).map((pos, id) => ({ id, pos: { ...pos }, taken: false })),
    scattered: [],
    nextScatterId: 1,
    spawn: spawnFeet,
    checkpoint: { ...spawnFeet },
  };
  playerIds.forEach((id, i) => {
    addHero(world, game, id, i, heroIds[i] ?? heroForSlot(i));
  });
  return game;
}

/** Adds a hero next to the level start (players spread 1.5 m apart). */
export function addHero(
  world: PhysicsWorld,
  game: GameState,
  id: string,
  slot = 0,
  heroId: HeroId = heroForSlot(slot),
): HeroState {
  const t = heroTuning(heroId);
  const spawn = centerAt({ ...game.spawn, x: game.spawn.x + slot * 1.5 }, t);
  const hero: HeroState = {
    hero: heroId,
    body: world.addCharacter(spawn, t.capsule),
    mover: createMover(spawn),
    crystals: 0,
    invuln: 0,
    downed: 0,
    interactHeld: false,
  };
  game.heroes[id] = hero;
  return hero;
}

export function removeHero(world: PhysicsWorld, game: GameState, id: string) {
  const hero = game.heroes[id];
  if (hero) world.removeCharacter(hero.body);
  delete game.heroes[id];
}

function feet(pos: Vec3, t: Tuning): Vec3 {
  return { x: pos.x, y: pos.y - standHeight(t), z: pos.z };
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

/** Timer floor that marks "down and waiting" (strictly positive, so `downed > 0` still means down). */
const DOWN_FLOOR = 1e-6;

/** Spreads heroes 1.2 m apart along X around a point, so they don't stand inside each other. */
function slotNear(p: Vec3, slot: number): Vec3 {
  return { x: p.x + slot * 1.2, y: p.y, z: p.z };
}

/** After a checkpoint is activated: teammates far behind (and standing) are moved to it. */
function pullStragglers(game: GameState, activator: string, events: GameEvent[]) {
  let slot = 1;
  for (const id of Object.keys(game.heroes).sort()) {
    const h = game.heroes[id];
    if (!h || id === activator || h.downed > 0) continue;
    if (!near(h.mover.pos, game.checkpoint, tuning.coop.pullDistance)) {
      h.mover = createMover(centerAt(slotNear(game.checkpoint, slot++), heroTuning(h.hero)));
      events.push({ type: "pulled", hero: id });
    }
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
  for (const id of Object.keys(game.heroes).sort()) {
    const h = game.heroes[id];
    if (!h) continue;
    const t = heroTuning(h.hero);

    if (h.downed > 0) {
      // Lies still; the timer only matters when the whole team is down (see below).
      h.downed = Math.max(DOWN_FLOOR, h.downed - dt);
      h.interactHeld = inputs[id]?.interact ?? false;
      continue;
    }

    h.invuln = Math.max(0, h.invuln - dt);
    const input = inputs[id];
    const before = h.mover;
    h.mover = stepMover(world, h.body, h.mover, input ?? NO_MOVE, dt, centerAt(game.checkpoint, t), t);
    if (before.pos.y < t.world.killY + 5 && h.mover.pos.y > before.pos.y + 5) {
      events.push({ type: "respawn", hero: id });
    }
    const f = feet(h.mover.pos, t);

    // Rubfir's slam: teammates standing near the landing are thrown up.
    if (h.mover.pounded) {
      events.push({ type: "pound", hero: id });
      for (const otherId of Object.keys(game.heroes).sort()) {
        const o = game.heroes[otherId];
        if (!o || otherId === id || o.downed > 0 || !o.mover.grounded) continue;
        if (near(o.mover.pos, h.mover.pos, t.tricks.poundRadius)) {
          o.mover = {
            ...o.mover,
            vel: { ...o.mover.vel, y: t.tricks.poundBounce },
            grounded: false,
            coyote: 0,
          };
        }
      }
    }

    for (const o of world.objects) {
      if (o.kind === "checkpoint" && atCheckpoint(f, o)) {
        const cp = { x: o.pos.x, y: o.pos.y + 0.05, z: o.pos.z };
        const c = game.checkpoint;
        if (cp.x !== c.x || cp.y !== c.y || cp.z !== c.z) {
          game.checkpoint = cp;
          events.push({ type: "checkpoint", hero: id });
          pullStragglers(game, id, events);
        }
      }
    }

    // Revive: a new press of E next to a downed teammate gets it up beside the reviver
    // (the reviver stands on safe ground; the downed spot is often the hazard itself).
    const interactPressed = (input?.interact ?? false) && !h.interactHeld;
    h.interactHeld = input?.interact ?? false;
    if (interactPressed) {
      for (const otherId of Object.keys(game.heroes).sort()) {
        const o = game.heroes[otherId];
        if (!o || otherId === id || o.downed === 0) continue;
        if (near(o.mover.pos, h.mover.pos, t.coop.reviveRadius)) {
          o.downed = 0;
          o.invuln = t.coop.reviveInvuln;
          o.mover = { ...createMover(centerAt(f, heroTuning(o.hero))), facing: o.mover.facing };
          events.push({ type: "revive", hero: otherId, by: id });
          break;
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

  // Whole team down (or a solo hero down): once every timer has run out, all get up at the checkpoint.
  const ids = Object.keys(game.heroes).sort();
  const team = ids.map((id) => game.heroes[id]).filter((h): h is HeroState => h !== undefined);
  if (team.length > 0 && team.every((h) => h.downed > 0) && team.every((h) => h.downed <= DOWN_FLOOR)) {
    team.forEach((h, i) => {
      h.downed = 0;
      h.invuln = tuning.hazards.invulnTime;
      h.mover = createMover(centerAt(slotNear(game.checkpoint, i), heroTuning(h.hero)));
      events.push({ type: "respawn", hero: ids[i] ?? "" });
    });
  }

  // Thrown crystals: simple ballistic flight with bouncy landings.
  for (const c of game.scattered) {
    c.age += dt;
    c.vel.y -= tuning.air.gravity * dt;
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
  game.scattered = game.scattered.filter((c) => c.age < tuning.scatter.life);
  return events;
}

const NO_MOVE: InputFrame = { moveX: 0, moveZ: 0, jump: false, spin: false, interact: false };
