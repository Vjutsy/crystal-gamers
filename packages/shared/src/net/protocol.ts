import type { InputFrame } from "../input.ts";
import { NO_INPUT } from "../input.ts";

/** Client → server, every simulation tick. `seq` grows by one per tick. */
export interface InputMessage {
  seq: number;
  input: InputFrame;
}

/** Never trust the client: coerce whatever arrives into a valid InputFrame. */
export function sanitizeInput(msg: unknown): InputFrame {
  if (typeof msg !== "object" || msg === null) return NO_INPUT;
  const m = msg as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return {
    moveX: num(m.moveX),
    moveZ: num(m.moveZ),
    jump: m.jump === true,
    spin: m.spin === true,
    interact: m.interact === true,
  };
}

/** Validates a whole input message; returns null for garbage (wrong shape, negative or huge seq). */
export function sanitizeInputMessage(msg: unknown): InputMessage | null {
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as Record<string, unknown>;
  const seq = m.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0 || seq > 2 ** 31) return null;
  return { seq, input: sanitizeInput(m.input) };
}
