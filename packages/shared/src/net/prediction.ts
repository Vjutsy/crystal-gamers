import type { Vec3 } from "../math.ts";
import { type MoverState, stepMover } from "../movement/mover.ts";
import type { PhysicsWorld } from "../physics/world.ts";
import type { InputMessage } from "./protocol.ts";

/** Inputs the client has applied locally but the server has not confirmed yet. */
export class InputHistory {
  private items: InputMessage[] = [];

  push(msg: InputMessage) {
    this.items.push(msg);
    // Safety cap: ~4 s at 60 Hz. If the server is that far behind, older inputs no longer matter.
    if (this.items.length > 240) this.items.shift();
  }

  /** Drops everything the server has processed (seq ≤ lastSeq). */
  ack(lastSeq: number) {
    let i = 0;
    while (i < this.items.length && (this.items[i]?.seq ?? Number.POSITIVE_INFINITY) <= lastSeq) i++;
    if (i > 0) this.items.splice(0, i);
  }

  pending(): readonly InputMessage[] {
    return this.items;
  }
}

/**
 * Client-side reconciliation (ADR-0003): start from the server's authoritative mover state
 * and re-apply the inputs the server has not seen yet. Thanks to deterministic movement,
 * if nothing unexpected happened this lands exactly where local prediction already was.
 */
export function replayMover(
  world: PhysicsWorld,
  body: number,
  serverState: MoverState,
  pending: readonly InputMessage[],
  dt: number,
  respawn: Vec3,
): MoverState {
  let s = serverState;
  for (const m of pending) s = stepMover(world, body, s, m.input, dt, respawn);
  return s;
}
