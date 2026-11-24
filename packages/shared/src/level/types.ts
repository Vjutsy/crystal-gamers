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

export interface Level {
  name: string;
  spawn: Vec3;
  solids: Solid[];
}
