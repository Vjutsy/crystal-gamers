/** Player intent for one tick. Keyboard, gamepad, replay or bot all produce this. */
export interface InputFrame {
  /** -1..1 on the ground plane, already converted to world axes. */
  moveX: number;
  moveZ: number;
  jump: boolean;
  /** Spin dash: hold to charge, release to dash. */
  spin: boolean;
}

export const NO_INPUT: InputFrame = { moveX: 0, moveZ: 0, jump: false, spin: false };
