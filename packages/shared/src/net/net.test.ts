import { beforeAll, describe, expect, it } from "vitest";
import { SIM_DT } from "../constants.ts";
import { NO_INPUT } from "../input.ts";
import { testLevel } from "../level/test-level.ts";
import { createMover, type MoverState, stepMover } from "../movement/mover.ts";
import { initPhysics, PhysicsWorld } from "../physics/world.ts";
import { createRng } from "../rng.ts";
import { InputHistory, replayMover } from "./prediction.ts";
import { type InputMessage, sanitizeInput, sanitizeInputMessage } from "./protocol.ts";

beforeAll(async () => {
  await initPhysics();
});

describe("input sanitising", () => {
  it("clamps and fills invalid fields", () => {
    expect(sanitizeInput({ moveX: 5, moveZ: Number.NaN, jump: "yes", interact: true })).toEqual({
      moveX: 1,
      moveZ: 0,
      jump: false,
      spin: false,
      interact: true,
    });
  });

  it("rejects garbage messages", () => {
    expect(sanitizeInput(null)).toEqual(NO_INPUT);
    expect(sanitizeInputMessage("hack")).toBeNull();
    expect(sanitizeInputMessage({ seq: -1, input: {} })).toBeNull();
    expect(sanitizeInputMessage({ seq: 1.5, input: {} })).toBeNull();
    expect(sanitizeInputMessage({ seq: 7, input: { moveZ: 1 } })?.input.moveZ).toBe(1);
  });
});

describe("prediction and reconciliation", () => {
  function randomInputs(n: number): InputMessage[] {
    const rng = createRng(11);
    return Array.from({ length: n }, (_, i) => ({
      seq: i + 1,
      input: {
        moveX: rng() * 2 - 1,
        moveZ: rng() * 2 - 1,
        jump: rng() < 0.1,
        spin: rng() < 0.05,
        interact: false,
      },
    }));
  }

  it("replaying unconfirmed inputs from the server state lands exactly on the local prediction", () => {
    const world = new PhysicsWorld(testLevel);
    const body = world.addCharacter(testLevel.spawn);
    const inputs = randomInputs(180);

    // Local prediction: all 180 ticks.
    const states: MoverState[] = [];
    let s = createMover(testLevel.spawn);
    for (const m of inputs) {
      s = stepMover(world, body, s, m.input, SIM_DT, testLevel.spawn);
      states.push(s);
    }

    // Server has confirmed up to seq 120 and sends its state at that point.
    const history = new InputHistory();
    for (const m of inputs) history.push(m);
    history.ack(120);
    expect(history.pending()).toHaveLength(60);
    const serverAt120 = states[119] as MoverState;
    const replayed = replayMover(world, body, serverAt120, history.pending(), SIM_DT, testLevel.spawn);
    expect(replayed).toEqual(states[179]);
    world.dispose();
  });

  it("ack drops only confirmed inputs", () => {
    const h = new InputHistory();
    for (let seq = 1; seq <= 5; seq++) h.push({ seq, input: NO_INPUT });
    h.ack(3);
    expect(h.pending().map((m) => m.seq)).toEqual([4, 5]);
    h.ack(10);
    expect(h.pending()).toHaveLength(0);
  });
});
