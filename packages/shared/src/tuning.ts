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
  },
  world: {
    /** Below this height the hero respawns. */
    killY: -15,
  },
};

export type Tuning = typeof tuning;
