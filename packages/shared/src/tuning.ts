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
  objects: {
    /** Horizontal reach of a spring, m (added to the capsule radius) */
    springRadius: 0.45,
  },
  world: {
    /** Below this height the hero respawns. */
    killY: -15,
  },
};

export type Tuning = typeof tuning;
