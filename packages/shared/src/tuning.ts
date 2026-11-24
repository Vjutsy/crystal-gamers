/**
 * All gameplay numbers live here, not in logic code.
 * Units: metres, seconds. Phase 1 adds a debug panel that edits these live.
 */
export const tuning = {
  move: {
    /** m/s² while a direction is held */
    accel: 40,
    /** m/s² of slowdown when no direction is held */
    friction: 30,
    /** m/s top running speed */
    maxSpeed: 9,
  },
};

export type Tuning = typeof tuning;
