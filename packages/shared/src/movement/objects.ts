import type { Booster, LevelObject, Spring } from "../level/types.ts";
import type { Vec3 } from "../math.ts";
import { tuning } from "../tuning.ts";

/** What touching level objects did to the hero this tick. */
export interface ObjectEffect {
  /** New velocity components, when an object overrides them. */
  vy?: number;
  vx?: number;
  vz?: number;
  /** True when the hero is launched into the air (springs). */
  launched: boolean;
}

function feetOf(pos: Vec3): Vec3 {
  const c = tuning.capsule;
  return { x: pos.x, y: pos.y - c.halfHeight - c.radius, z: pos.z };
}

function touchesSpring(feet: Vec3, s: Spring): boolean {
  const reach = tuning.objects.springRadius + tuning.capsule.radius;
  const dx = feet.x - s.pos.x;
  const dz = feet.z - s.pos.z;
  return dx * dx + dz * dz <= reach * reach && feet.y >= s.pos.y - 0.15 && feet.y <= s.pos.y + 0.6;
}

function touchesBooster(feet: Vec3, b: Booster): boolean {
  if (Math.abs(feet.y - b.pos.y) > 0.3) return false;
  const yaw = (b.yaw * Math.PI) / 180;
  const fx = Math.sin(yaw); // booster forward axis
  const fz = Math.cos(yaw);
  const dx = feet.x - b.pos.x;
  const dz = feet.z - b.pos.z;
  const along = dx * fx + dz * fz;
  const across = dx * fz - dz * fx;
  return Math.abs(along) <= b.length / 2 && Math.abs(across) <= b.width / 2;
}

/**
 * Applies springs and boosters touched at `pos`. Pure: same inputs → same effect.
 * Springs fire only while the hero is not already flying upward, so one touch = one launch.
 */
export function touchObjects(
  objects: readonly LevelObject[],
  pos: Vec3,
  vel: Vec3,
  grounded: boolean,
): ObjectEffect {
  const feet = feetOf(pos);
  const out: ObjectEffect = { launched: false };
  for (const o of objects) {
    if (o.kind === "spring") {
      if (vel.y <= 0.5 && touchesSpring(feet, o)) {
        out.vy = o.power;
        if (o.push) {
          out.vx = o.push.x;
          out.vz = o.push.z;
        }
        out.launched = true;
      }
    } else if (grounded && touchesBooster(feet, o)) {
      const yaw = (o.yaw * Math.PI) / 180;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const along = vel.x * fx + vel.z * fz;
      const speed = Math.max(o.speed, along);
      out.vx = fx * speed;
      out.vz = fz * speed;
    }
  }
  return out;
}
