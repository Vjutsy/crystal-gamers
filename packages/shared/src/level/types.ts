import type { Vec3 } from "../math.ts";

/** Visual hint only; physics treats every solid the same. */
export type SolidStyle = "grass" | "dirt" | "block" | "ramp" | "step";

/** A static box in the level. Ramps are tilted boxes. */
export interface Solid {
  /** Centre of the box, metres. */
  pos: Vec3;
  /** Full size (not half-extents), metres. */
  size: Vec3;
  /** Euler rotation in degrees [x, y, z], see quatFromEulerDeg. */
  rot?: [number, number, number];
  style: SolidStyle;
}

/** Launches the hero upward (and optionally sideways) on touch. Not solid. */
export interface Spring {
  kind: "spring";
  /** Centre of the spring's base, on the surface it stands on. */
  pos: Vec3;
  /** Upward speed given, m/s. Peak height ≈ power² / (2 · gravity). */
  power: number;
  /** Optional horizontal speed added (diagonal springs), m/s in world axes. */
  push?: { x: number; z: number };
}

/** Flat pad that instantly sets running speed along its direction. Not solid. */
export interface Booster {
  kind: "booster";
  /** Centre of the pad, on the surface it lies on. */
  pos: Vec3;
  /** Footprint along its own axes: `length` in its direction, `width` across. */
  length: number;
  width: number;
  /** Direction in degrees around Y: 0 = +Z, 90 = +X. */
  yaw: number;
  /** Speed given, m/s. */
  speed: number;
}

export type LevelObject = Spring | Booster;

export interface Level {
  name: string;
  spawn: Vec3;
  solids: Solid[];
  objects?: LevelObject[];
}
