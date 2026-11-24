import type { InputFrame } from "../input.ts";
import type { Vec3 } from "../math.ts";
import type { PhysicsWorld } from "../physics/world.ts";
import { type MoverState, stepMover } from "./mover.ts";

/** A recorded run: where it started and one input per fixed tick. */
export interface Replay {
  start: MoverState;
  spawn: Vec3;
  dt: number;
  inputs: InputFrame[];
}

/** Re-simulates a replay and returns every state (index 0 = after the first tick). */
export function runReplay(world: PhysicsWorld, id: number, r: Replay): MoverState[] {
  const out: MoverState[] = [];
  let s = r.start;
  for (const input of r.inputs) {
    s = stepMover(world, id, s, input, r.dt, r.spawn);
    out.push(s);
  }
  return out;
}
