import type { InputFrame } from "../input.ts";
import type { Vec3 } from "../math.ts";
import type { PhysicsWorld } from "../physics/world.ts";
import { tuning } from "../tuning.ts";

/** Everything needed to continue a character's movement. Plain data: easy to send, copy and replay. */
export interface MoverState {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
}

export function createMover(spawn: Vec3): MoverState {
  return { pos: { ...spawn }, vel: { x: 0, y: 0, z: 0 }, grounded: false };
}

/** A wall is anything steeper than this (normal.y below it). */
const WALL_NORMAL_Y = 0.3;

/**
 * Advances one character by one fixed tick.
 * Pure with respect to its arguments: same world + state + input → same result (see ADR-0002).
 */
export function stepMover(
  world: PhysicsWorld,
  id: number,
  s: MoverState,
  input: InputFrame,
  dt: number,
  spawn: Vec3,
): MoverState {
  const t = tuning;
  let { x: vx, y: vy, z: vz } = s.vel;

  // --- Horizontal: accelerate towards the input direction, brake hard when turning back.
  const inLen = Math.hypot(input.moveX, input.moveZ);
  const strength = Math.min(inLen, 1);

  if (strength > 0) {
    // Unit direction of the input; `strength` (0..1) scales the target speed for analog sticks.
    const dx = input.moveX / inLen;
    const dz = input.moveZ / inLen;
    let along = vx * dx + vz * dz; // speed in the wished direction
    let perpX = vx - dx * along; // sideways drift
    let perpZ = vz - dz * along;

    // Moving against the input: brake hard first (fast turnaround), then accelerate normally below.
    if (along < 0) along = Math.min(0, along + t.move.turnDecel * dt);
    const target = t.move.maxSpeed * strength;
    if (along < target) along = Math.min(target, along + t.move.accel * dt);
    else along = Math.max(target, along - t.move.overSpeedDecel * dt);

    // Kill sideways drift quickly so steering feels grippy.
    const perp = Math.hypot(perpX, perpZ);
    if (perp > 0) {
      const k = Math.max(0, perp - t.move.turnDecel * dt) / perp;
      perpX *= k;
      perpZ *= k;
    }
    vx = dx * along + perpX;
    vz = dz * along + perpZ;
  } else {
    const speed = Math.hypot(vx, vz);
    const k = speed > 0 ? Math.max(0, speed - t.move.friction * dt) / speed : 0;
    vx *= k;
    vz *= k;
  }

  // --- Slopes: a share of gravity pulls the hero downhill (uphill slows, downhill speeds up).
  const ground = s.grounded ? world.groundNormal(id, s.pos, t.capsule.snapToGround) : null;
  if (ground && ground.y < 0.999) {
    const g = t.air.gravity * t.move.slopeFactor * ground.y;
    vx += g * ground.x * dt;
    vz += g * ground.z * dt;
  }

  // --- Vertical.
  if (s.grounded) vy = 0;
  else vy = Math.max(-t.air.maxFall, vy - t.air.gravity * dt);

  const desired = { x: vx * dt, y: s.grounded ? -0.02 : vy * dt, z: vz * dt };
  const res = world.move(id, s.pos, desired);

  // --- Remove the velocity that went into walls and ceilings, so speed never builds up against them.
  for (const n of res.normals) {
    if (n.y < WALL_NORMAL_Y && n.y > -WALL_NORMAL_Y) {
      const hl = Math.hypot(n.x, n.z);
      if (hl === 0) continue;
      const nx = n.x / hl;
      const nz = n.z / hl;
      const into = vx * nx + vz * nz;
      if (into < 0) {
        vx -= into * nx;
        vz -= into * nz;
      }
    } else if (n.y <= -WALL_NORMAL_Y && vy > 0) {
      vy = 0;
    }
  }
  if (res.grounded) vy = 0;

  const pos = { x: s.pos.x + res.delta.x, y: s.pos.y + res.delta.y, z: s.pos.z + res.delta.z };
  if (pos.y < t.world.killY) return createMover(spawn);

  return { pos, vel: { x: vx, y: vy, z: vz }, grounded: res.grounded };
}
