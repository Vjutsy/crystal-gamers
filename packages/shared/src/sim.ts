import { SIM_DT } from "./constants.ts";
import { tuning } from "./tuning.ts";

/**
 * Placeholder simulation for Phase 0: flat-ground movement with acceleration
 * and friction. Phase 1 replaces this with a real character controller,
 * but the contract stays the same: step(state, input) -> new state.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Player intent for one tick. Keyboard, gamepad or bot all produce this. */
export interface InputFrame {
  /** -1..1 on the ground plane, already in world axes. */
  moveX: number;
  moveZ: number;
  jump: boolean;
}

export interface PlayerSim {
  pos: Vec3;
  vel: Vec3;
}

export const NO_INPUT: InputFrame = { moveX: 0, moveZ: 0, jump: false };

export function createPlayer(spawn: Vec3 = { x: 0, y: 0, z: 0 }): PlayerSim {
  return { pos: { ...spawn }, vel: { x: 0, y: 0, z: 0 } };
}

export function stepPlayer(p: PlayerSim, input: InputFrame, dt: number = SIM_DT): PlayerSim {
  const { accel, friction, maxSpeed } = tuning.move;
  let mx = clamp(input.moveX, -1, 1);
  let mz = clamp(input.moveZ, -1, 1);
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }

  let vx = p.vel.x + mx * accel * dt;
  let vz = p.vel.z + mz * accel * dt;

  if (len === 0) {
    const speed = Math.hypot(vx, vz);
    const drop = friction * dt;
    const k = speed > drop ? (speed - drop) / speed : 0;
    vx *= k;
    vz *= k;
  }

  const speed = Math.hypot(vx, vz);
  if (speed > maxSpeed) {
    vx = (vx / speed) * maxSpeed;
    vz = (vz / speed) * maxSpeed;
  }

  return {
    pos: { x: p.pos.x + vx * dt, y: p.pos.y, z: p.pos.z + vz * dt },
    vel: { x: vx, y: 0, z: vz },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
