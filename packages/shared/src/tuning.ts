/** none | pound (Rubfir) | doubleJump (Nevetes) | airDash (Erl) | ramSpin (Emi, used by breakables) */
export type TrickKind = "none" | "pound" | "doubleJump" | "airDash" | "ramSpin";

/**
 * All gameplay numbers live here, not in logic code.
 * Units: metres, seconds, degrees. The ?debug panel edits these live (SPEC-0001 step 3).
 */
export const tuning = {
  capsule: {
    /** Half of the cylinder part; total height = 2 * (halfHeight + radius). */
    halfHeight: 0.45,
    radius: 0.4,
    /** Gap kept between the capsule and the level, avoids getting stuck. */
    skin: 0.02,
    /** Steepest slope (degrees) the hero can walk up. */
    maxSlopeDeg: 45,
    /** Steps up to this height (m) are climbed automatically. */
    stepHeight: 0.35,
    stepMinWidth: 0.2,
    /** Keeps the hero glued to the ground when running down slopes or off small bumps. */
    snapToGround: 0.3,
  },
  move: {
    /** m/s² while a direction is held */
    accel: 26,
    /** m/s² of slowdown when no direction is held */
    friction: 34,
    /** m/s² of extra braking when pushing against the current direction (fast turnaround) */
    turnDecel: 70,
    /** m/s top running speed */
    maxSpeed: 10,
    /** m/s² of slowdown above maxSpeed (after boosts) */
    overSpeedDecel: 8,
    /** 0..1 share of gravity that pulls the hero along slopes (uphill slower, downhill faster) */
    slopeFactor: 0.6,
  },
  air: {
    /** m/s² downward */
    gravity: 32,
    /** m/s cap on falling speed */
    maxFall: 30,
    /** 0..1 share of ground acceleration and turning available in the air */
    control: 0.6,
    /** 0..1 share of ground friction applied in the air when no direction is held */
    drag: 0.15,
  },
  jump: {
    /** m/s upward at take-off; peak height ≈ velocity² / (2 · gravity) */
    velocity: 12,
    /** Releasing the button while rising multiplies upward speed by this (short hop) */
    releaseCut: 0.4,
    /** s after leaving an edge during which a jump still works */
    coyoteTime: 0.1,
    /** s a press is remembered before landing */
    bufferTime: 0.12,
  },
  spinDash: {
    /** s of holding per charge level (3 levels) */
    levelTime: 0.3,
    /** m/s added on top of maxSpeed at charge levels 1, 2 and 3 */
    boost1: 5,
    boost2: 9,
    boost3: 13,
    /** m/s² braking while charging */
    chargeBrake: 60,
    /** m/s² slowdown of a rolling hero with no input (gentler than friction, so dashes carry) */
    rollDecel: 6,
  },
  /** Hero movement tricks (SPEC-0003): a second jump press in the air, or Emi's ramming spin. */
  tricks: {
    /** Which trick this body has; set per hero by heroTuning. */
    kind: "none" as TrickKind,
    /** Nevetes: second jump, share of the normal jump speed */
    doubleJump: 0.85,
    /** Rubfir: m/s straight down while slamming */
    poundSpeed: 30,
    /** Rubfir: m/s upward given to teammates standing near the landing */
    poundBounce: 9,
    /** Rubfir: m reach of the landing shock */
    poundRadius: 3,
    /** Erl: m/s of the air dash and how long it lasts, s (no falling meanwhile) */
    dashSpeed: 16,
    dashTime: 0.2,
  },
  objects: {
    /** Horizontal reach of a spring, m (added to the capsule radius) */
    springRadius: 0.45,
  },
  hazards: {
    /** m/s pushed away from the hazard on a hit */
    knockback: 7,
    /** m/s upward on a hit */
    knockbackUp: 8,
    /** s of invulnerability after a hit (the hero blinks) */
    invulnTime: 1.5,
    /** s a downed hero stays down before respawning at the checkpoint (solo) */
    downedTime: 1.2,
  },
  coop: {
    /** m reach for reviving a downed teammate with E (centre to centre) */
    reviveRadius: 1.8,
    /** s of invulnerability after being revived */
    reviveInvuln: 1.5,
    /** m: when a checkpoint is activated, teammates farther than this from it are moved there */
    pullDistance: 20,
  },
  scatter: {
    /** Lost crystals that are thrown out (the rest are gone for good) */
    max: 16,
    /** m/s outward and upward when crystals are thrown */
    speed: 6,
    up: 7,
    /** s before thrown crystals can be picked up again, and before they vanish */
    pickupDelay: 0.5,
    life: 3,
    /** m reach for picking up any crystal (hero centre to crystal) */
    pickupRadius: 1,
  },
  world: {
    /** Below this height the hero respawns. */
    killY: -15,
  },
};

export type Tuning = typeof tuning;
