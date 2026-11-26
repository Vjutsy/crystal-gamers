import { type Tuning, tuning } from "./tuning.ts";

/** The four heroes (SPEC-0003). One of each per room. */
export const HERO_IDS = ["rubfir", "nevetes", "erl", "emi"] as const;
export type HeroId = (typeof HERO_IDS)[number];

export interface HeroDef {
  id: HeroId;
  name: string;
  /** Greybox colour until Phase 6 art. */
  color: string;
  /** Body: capsule cylinder half-height and radius, m (total height = 2·(halfHeight + radius)). */
  capsule: { halfHeight: number; radius: number };
  /**
   * How this hero's body changes the shared movement numbers: multipliers on `tuning`,
   * so the ?debug panel still tunes everyone together.
   */
  scale: {
    accel: number;
    /** How quickly the hero stops when no direction is held (heavy heroes slide). */
    friction: number;
    turnDecel: number;
    maxSpeed: number;
    jumpVelocity: number;
    gravity: number;
    airControl: number;
    spinBoost: number;
    knockback: number;
  };
}

const NORMAL: HeroDef["scale"] = {
  accel: 1,
  friction: 1,
  turnDecel: 1,
  maxSpeed: 1,
  jumpVelocity: 1,
  gravity: 1,
  airControl: 1,
  spinBoost: 1,
  knockback: 1,
};

export const heroes: Record<HeroId, HeroDef> = {
  /** Tallest and massive: slow to start but the fastest once running, slides when stopping, heavy low jump, stiff in the air, barely knocked back. */
  rubfir: {
    id: "rubfir",
    name: "Рубфір",
    color: "#7d2335",
    capsule: { halfHeight: 0.75, radius: 0.45 },
    scale: {
      ...NORMAL,
      accel: 0.6,
      friction: 0.5,
      turnDecel: 0.55,
      maxSpeed: 1.25,
      jumpVelocity: 0.9,
      gravity: 1.25,
      airControl: 0.6,
      knockback: 0.35,
    },
  },
  /** Smallest: starts, stops and turns almost instantly, springy jump, nimble in the air, lowest top speed. */
  nevetes: {
    id: "nevetes",
    name: "Неветес",
    color: "#e58fb8",
    capsule: { halfHeight: 0.22, radius: 0.36 },
    scale: {
      ...NORMAL,
      accel: 2,
      friction: 1.7,
      turnDecel: 2,
      maxSpeed: 0.75,
      jumpVelocity: 1.1,
      gravity: 1.15,
      airControl: 1.4,
    },
  },
  /** Thinnest and light: floaty — highest, longest jump and the best control in the air. */
  erl: {
    id: "erl",
    name: "Ерл",
    color: "#9cc9e3",
    capsule: { halfHeight: 0.62, radius: 0.28 },
    scale: { ...NORMAL, accel: 1.1, maxSpeed: 1.05, gravity: 0.65, airControl: 1.6 },
  },
  /** Widest and short-ish: slowest to get going and to turn, hard to push around, by far the strongest spin dash. */
  emi: {
    id: "emi",
    name: "Емі",
    color: "#8a5cc7",
    capsule: { halfHeight: 0.3, radius: 0.5 },
    scale: {
      ...NORMAL,
      accel: 0.5,
      friction: 0.8,
      turnDecel: 0.6,
      maxSpeed: 0.95,
      jumpVelocity: 0.92,
      gravity: 1.1,
      spinBoost: 1.6,
      knockback: 0.2,
    },
  },
};

export function isHeroId(v: unknown): v is HeroId {
  return typeof v === "string" && (HERO_IDS as readonly string[]).includes(v);
}

/**
 * Movement numbers for one hero: the shared `tuning` with this hero's body and multipliers.
 * Built fresh on each call, so live edits of `tuning` (?debug) apply to every hero at once.
 */
export function heroTuning(id: HeroId): Tuning {
  const h = heroes[id];
  const s = h.scale;
  const t = tuning;
  return {
    ...t,
    capsule: { ...t.capsule, ...h.capsule },
    move: {
      ...t.move,
      accel: t.move.accel * s.accel,
      friction: t.move.friction * s.friction,
      turnDecel: t.move.turnDecel * s.turnDecel,
      maxSpeed: t.move.maxSpeed * s.maxSpeed,
    },
    air: { ...t.air, gravity: t.air.gravity * s.gravity, control: Math.min(1, t.air.control * s.airControl) },
    jump: { ...t.jump, velocity: t.jump.velocity * s.jumpVelocity },
    spinDash: {
      ...t.spinDash,
      boost1: t.spinDash.boost1 * s.spinBoost,
      boost2: t.spinDash.boost2 * s.spinBoost,
      boost3: t.spinDash.boost3 * s.spinBoost,
    },
    hazards: {
      ...t.hazards,
      knockback: t.hazards.knockback * s.knockback,
      knockbackUp: t.hazards.knockbackUp * Math.max(0.5, s.knockback),
    },
  };
}

/** Distance from feet to capsule centre. */
export function standHeight(t: { capsule: { halfHeight: number; radius: number } }): number {
  return t.capsule.halfHeight + t.capsule.radius;
}
