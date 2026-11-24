export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

const DEG = Math.PI / 180;

/**
 * Quaternion from Euler angles in degrees, applied as yaw (Y), then pitch (X), then roll (Z).
 * Client and physics both use this exact quaternion, so meshes and colliders always match.
 */
export function quatFromEulerDeg(xDeg: number, yDeg: number, zDeg: number): Quat {
  const hx = (xDeg * DEG) / 2;
  const hy = (yDeg * DEG) / 2;
  const hz = (zDeg * DEG) / 2;
  const sx = Math.sin(hx);
  const cx = Math.cos(hx);
  const sy = Math.sin(hy);
  const cy = Math.cos(hy);
  const sz = Math.sin(hz);
  const cz = Math.cos(hz);
  return {
    x: cy * sx * cz + sy * cx * sz,
    y: sy * cx * cz - cy * sx * sz,
    z: cy * cx * sz - sy * sx * cz,
    w: cy * cx * cz + sy * sx * sz,
  };
}
