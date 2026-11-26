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
  turnDecel: 1,
  maxSpeed: 1,
  jumpVelocity: 1,
  gravity: 1,
  airControl: 1,
  spinBoost: 1,
  knockback: 1,
};

export const heroes: Record<HeroId, HeroDef> = {
  /** Tallest and massive: long stride, top ground speed, heavy low jump, barely knocked back. */
  rubfir: {
    id: "rubfir",
    name: "Рубфір",
    color: "#7d2335",
    capsule: { halfHeight: 0.75, radius: 0.45 },
    scale: {
      ...NORMAL,
      accel: 0.8,
      turnDecel: 0.8,
      maxSpeed: 1.12,
      jumpVelocity: 0.9,
      gravity: 1.12,
      knockback: 0.45,
    },
  },
  /** Smallest: quickest to start and turn, springy jump, lowest top speed. */
  nevetes: {
    id: "nevetes",
    name: "Неветес",
    color: "#e58fb8",
    capsule: { halfHeight: 0.22, radius: 0.36 },
    scale: { ...NORMAL, accel: 1.35, turnDecel: 1.3, maxSpeed: 0.86, jumpVelocity: 1.05, airControl: 1.15 },
  },
  /** Thinnest and light: highest, longest jump and the best control in the air. */
  erl: {
    id: "erl",
    name: "Ерл",
    color: "#9cc9e3",
    capsule: { halfHeight: 0.62, radius: 0.28 },
    scale: { ...NORMAL, accel: 1.05, jumpVelocity: 1.08, gravity: 0.86, airControl: 1.5 },
  },
  /** Widest and short-ish: slow to get going, hard to push around, strongest spin dash. */
  emi: {
    id: "emi",
    name: "Емі",
    color: "#8a5cc7",
    capsule: { halfHeight: 0.3, radius: 0.5 },
    scale: {
      ...NORMAL,
      accel: 0.72,
      turnDecel: 0.85,
      maxSpeed: 0.96,
      jumpVelocity: 0.95,
      spinBoost: 1.3,
      knockback: 0.3,
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
