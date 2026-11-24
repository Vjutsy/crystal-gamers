import type { Level, Solid } from "./types.ts";

/**
 * Greybox playground for Phase 1 (SPEC-0001).
 * Layout (top view, +X right, +Z up):
 *   - big flat floor around the origin
 *   - three ramps of 15°, 30° and 50° along +X
 *   - a staircase of small steps and one tall step along -X
 *   - a raised platform reachable by the 15° ramp
 */
const RAMP_LEN = 6;

function ramp(x: number, z: number, angleDeg: number): Solid {
  const rad = (angleDeg * Math.PI) / 180;
  const height = Math.sin(rad) * RAMP_LEN;
  // Tilted box resting on the floor: centre lifted by half its rise.
  return {
    pos: { x, y: height / 2 - Math.cos(rad) * 0.25, z },
    size: { x: 3, y: 0.5, z: RAMP_LEN },
    rot: [-angleDeg, 0, 0],
    style: "ramp",
  };
}

const solids: Solid[] = [
  // Floor: top surface at y = 0.
  { pos: { x: 0, y: -0.5, z: 0 }, size: { x: 48, y: 1, z: 48 }, style: "grass" },

  // Ramps rising towards +Z.
  ramp(6, 6, 15),
  ramp(11, 6, 30),
  ramp(16, 6, 50),

  // Platform at the top of the 15° ramp (rise ≈ 1.55 m).
  { pos: { x: 6, y: 0.78, z: 12 }, size: { x: 6, y: 1.55, z: 6 }, style: "block" },

  // Staircase: 0.25 m steps (should be climbed automatically).
  { pos: { x: -6, y: 0.125, z: 4 }, size: { x: 3, y: 0.25, z: 1 }, style: "step" },
  { pos: { x: -6, y: 0.25, z: 5 }, size: { x: 3, y: 0.5, z: 1 }, style: "step" },
  { pos: { x: -6, y: 0.375, z: 6 }, size: { x: 3, y: 0.75, z: 1 }, style: "step" },
  { pos: { x: -6, y: 0.5, z: 8 }, size: { x: 3, y: 1, z: 3 }, style: "step" },

  // A single 0.6 m ledge (too tall to step, needs a jump in step 2).
  { pos: { x: -11, y: 0.3, z: 6 }, size: { x: 3, y: 0.6, z: 3 }, style: "block" },

  // Walls to bump into.
  { pos: { x: 0, y: 1, z: -10 }, size: { x: 8, y: 2, z: 1 }, style: "block" },
];

export const testLevel: Level = {
  name: "phase1-playground",
  spawn: { x: 0, y: 1, z: 0 },
  solids,
};
