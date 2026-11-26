import type { InputFrame } from "../input.ts";
import type { Vec3 } from "../math.ts";
import type { PhysicsWorld } from "../physics/world.ts";
import { type Tuning, tuning } from "../tuning.ts";
import { touchObjects } from "./objects.ts";

/** Everything needed to continue a character's movement. Plain data: easy to send, copy and replay. */
export interface MoverState {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  /** Seconds of coyote time left (jumping is still allowed after leaving an edge). */
  coyote: number;
  /** Seconds a recent jump press is still remembered (jump buffer). */
  jumpBuffer: number;
  /** Jump button state on the previous tick, to detect new presses. */
  jumpHeld: boolean;
  /** True while rising from a jump whose height can still be cut by releasing the button. */
  jumpCuttable: boolean;
  /** Unit direction the hero faces on the ground plane (spin dash goes this way). */
  facing: { x: number; z: number };
  /** Seconds the spin dash has been charging, or -1 when not charging. */
  spinCharge: number;
  /** True after a spin dash until the hero slows back to normal running speed. */
  rolling: boolean;
}

export function createMover(spawn: Vec3): MoverState {
  return {
    pos: { ...spawn },
    vel: { x: 0, y: 0, z: 0 },
    grounded: false,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    jumpCuttable: false,
    facing: { x: 0, z: 1 },
    spinCharge: -1,
    rolling: false,
  };
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
  /** This hero's numbers (heroTuning); defaults to the shared tuning. */
  t: Tuning = tuning,
): MoverState {
  let { x: vx, y: vy, z: vz } = s.vel;
  const control = s.grounded ? 1 : t.air.control;

  // --- Spin dash: hold to charge in place (input only turns the hero), release to dash.
  const inLen = Math.hypot(input.moveX, input.moveZ);
  const strength = Math.min(inLen, 1);
  let facing = s.facing;
  if (strength > 0) facing = { x: input.moveX / inLen, z: input.moveZ / inLen };
  let rolling = s.rolling;
  let spinCharge = s.spinCharge;
  const jumpPressed = input.jump && !s.jumpHeld;
  const charging = s.grounded && input.spin && !jumpPressed;

  if (charging) {
    spinCharge = Math.max(0, spinCharge) + dt;
    rolling = false;
    const speed = Math.hypot(vx, vz);
    const k = speed > 0 ? Math.max(0, speed - t.spinDash.chargeBrake * dt) / speed : 0;
    vx *= k;
    vz *= k;
  } else if (spinCharge >= 0) {
    // Released (or interrupted). Dash only if still on the ground.
    if (s.grounded) {
      const level = Math.min(3, 1 + Math.floor(spinCharge / t.spinDash.levelTime));
      const boost = level === 1 ? t.spinDash.boost1 : level === 2 ? t.spinDash.boost2 : t.spinDash.boost3;
      const dashSpeed = t.move.maxSpeed + boost;
      vx = facing.x * dashSpeed;
      vz = facing.z * dashSpeed;
      rolling = true;
    }
    spinCharge = -1;
  } else if (strength > 0) {
    // Unit direction of the input; `strength` (0..1) scales the target speed for analog sticks.
    const dx = input.moveX / inLen;
    const dz = input.moveZ / inLen;
    let along = vx * dx + vz * dz; // speed in the wished direction
    let perpX = vx - dx * along; // sideways drift
    let perpZ = vz - dz * along;
    const turn = t.move.turnDecel * control;

    // Moving against the input: brake hard first (fast turnaround), then accelerate normally below.
    if (along < 0) along = Math.min(0, along + turn * dt);
    const target = t.move.maxSpeed * strength;
    if (along < target) along = Math.min(target, along + t.move.accel * control * dt);
    else if (s.grounded) along = Math.max(target, along - t.move.overSpeedDecel * dt);

    // Kill sideways drift quickly so steering feels grippy.
    const perp = Math.hypot(perpX, perpZ);
    if (perp > 0) {
      const k = Math.max(0, perp - turn * dt) / perp;
      perpX *= k;
      perpZ *= k;
    }
    vx = dx * along + perpX;
    vz = dz * along + perpZ;
  } else {
    const speed = Math.hypot(vx, vz);
    const decel = rolling ? t.spinDash.rollDecel : t.move.friction * (s.grounded ? 1 : t.air.drag);
    const k = speed > 0 ? Math.max(0, speed - decel * dt) / speed : 0;
    vx *= k;
    vz *= k;
  }

  // --- Slopes: a share of gravity pulls the hero downhill (uphill slows, downhill speeds up).
  const ground = s.grounded ? world.groundNormal(id, s.pos, t.capsule.snapToGround, t.capsule) : null;
  if (ground && ground.y < 0.999) {
    const g = t.air.gravity * t.move.slopeFactor * ground.y;
    vx += g * ground.x * dt;
    vz += g * ground.z * dt;
  }

  // --- Jump: a new press is buffered; coyote time allows jumping just after leaving an edge.
  const pressed = input.jump && !s.jumpHeld;
  let jumpBuffer = pressed ? t.jump.bufferTime : Math.max(0, s.jumpBuffer - dt);
  let coyote = s.grounded ? t.jump.coyoteTime : Math.max(0, s.coyote - dt);
  let jumpCuttable = s.jumpCuttable;
  let airborne = !s.grounded;

  if (jumpBuffer > 0 && (s.grounded || coyote > 0)) {
    vy = t.jump.velocity;
    jumpBuffer = 0;
    coyote = 0;
    jumpCuttable = true;
    airborne = true;
  } else if (s.grounded) {
    vy = 0;
  } else {
    vy = Math.max(-t.air.maxFall, vy - t.air.gravity * dt);
  }

  // Releasing the button while rising cuts the jump short (variable height).
  if (jumpCuttable && !input.jump && vy > 0) {
    vy *= t.jump.releaseCut;
    jumpCuttable = false;
  }
  if (vy <= 0) jumpCuttable = false;

  const desired = { x: vx * dt, y: airborne ? vy * dt : -0.02, z: vz * dt };
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
      jumpCuttable = false;
    }
  }

  // Rising through the snap distance must not count as landing.
  let grounded = res.grounded && vy <= 0;
  if (grounded) vy = 0;

  const pos = { x: s.pos.x + res.delta.x, y: s.pos.y + res.delta.y, z: s.pos.z + res.delta.z };

  // --- Never below the surface right under the centre. Rapier's snap-to-ground occasionally pulls
  // an idle capsule into the floor (depends on its size and spot; it could even fall through).
  // On slopes the real resting height is above this limit, so it only ever undoes sinking.
  if (vy <= 0) {
    const stand = t.capsule.halfHeight + t.capsule.radius;
    const below = world.surfaceBelow(pos, stand + 0.5);
    if (below !== null && pos.y - below > 0.01) {
      const minY = below + stand + t.capsule.skin;
      if (pos.y < minY) {
        pos.y = minY;
        vy = 0;
        grounded = true;
      }
    }
  }
  if (pos.y < t.world.killY) return createMover(spawn);

  // --- Springs and boosters.
  const fx = touchObjects(world.objects, pos, { x: vx, y: vy, z: vz }, grounded, t);
  if (fx.vx !== undefined) vx = fx.vx;
  if (fx.vz !== undefined) vz = fx.vz;
  if (fx.vy !== undefined) vy = fx.vy;
  if (fx.launched) {
    grounded = false;
    jumpCuttable = false;
    coyote = 0;
    spinCharge = -1;
  }

  if (rolling && Math.hypot(vx, vz) <= t.move.maxSpeed) rolling = false;

  return {
    pos,
    vel: { x: vx, y: vy, z: vz },
    grounded,
    coyote,
    jumpBuffer,
    jumpHeld: input.jump,
    jumpCuttable,
    facing,
    spinCharge,
    rolling,
  };
}
