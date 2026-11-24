import type { Vec3 } from "../math.ts";
import type { Level, LevelObject, Solid } from "./types.ts";

/**
 * Level design rule (author request, 2026-11-24): main routes must run along SCREEN axes,
 * so the player mostly holds a single key. The isometric camera looks along the world
 * diagonal, therefore levels are authored in screen-aligned coordinates
 *   +Z = up the screen (W),  +X = right on the screen (D)
 * and rotated into the world by this yaw when loaded.
 */
export const SCREEN_YAW_DEG = 45;

/** Rotates a point around the Y axis by `yawDeg` (0 = +Z, 90 = +X convention, same as solids). */
export function rotateY(p: Vec3, yawDeg: number): Vec3 {
  const a = (yawDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function orientSolid(s: Solid, yaw: number): Solid {
  const rot = s.rot ?? [0, 0, 0];
  return { ...s, pos: rotateY(s.pos, yaw), rot: [rot[0], rot[1] + yaw, rot[2]] };
}

function orientObject(o: LevelObject, yaw: number): LevelObject {
  if (o.kind === "spring") {
    const push = o.push ? rotateY({ x: o.push.x, y: 0, z: o.push.z }, yaw) : undefined;
    return { ...o, pos: rotateY(o.pos, yaw), ...(push ? { push: { x: push.x, z: push.z } } : {}) };
  }
  if (o.kind === "checkpoint") return { ...o, pos: rotateY(o.pos, yaw) };
  return { ...o, pos: rotateY(o.pos, yaw), yaw: o.yaw + yaw };
}

/** Converts a level authored in screen-aligned coordinates into world coordinates. */
export function orientLevel(level: Level, yawDeg = SCREEN_YAW_DEG): Level {
  return {
    ...level,
    spawn: rotateY(level.spawn, yawDeg),
    solids: level.solids.map((s) => orientSolid(s, yawDeg)),
    objects: level.objects?.map((o) => orientObject(o, yawDeg)),
    crystals: level.crystals?.map((c) => rotateY(c, yawDeg)),
  };
}
