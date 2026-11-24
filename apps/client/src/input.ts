import type { InputFrame } from "@cg/shared";

const held = new Set<string>();
/** Keys the game uses; the browser must not scroll the page or move focus with them. */
const GAME_KEYS = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ShiftLeft",
  "ShiftRight",
]);

export function bindKeyboard(target: Window) {
  target.addEventListener("keydown", (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    held.add(e.code);
  });
  target.addEventListener("keyup", (e) => held.delete(e.code));
  target.addEventListener("blur", () => held.clear());
}

/**
 * Converts held keys into world-space movement for an isometric camera.
 * "Up" on screen runs along +X+Z in the world (camera looks from -X,-Z).
 */
export function readInput(): InputFrame {
  const up = held.has("KeyW") || held.has("ArrowUp");
  const down = held.has("KeyS") || held.has("ArrowDown");
  const left = held.has("KeyA") || held.has("ArrowLeft");
  const right = held.has("KeyD") || held.has("ArrowRight");
  const sy = (up ? 1 : 0) - (down ? 1 : 0);
  const sx = (right ? 1 : 0) - (left ? 1 : 0);
  // Rotate screen axes by 45°: up → (+1,+1), right → (+1,-1), normalised.
  const k = Math.SQRT1_2;
  return {
    moveX: (sy + sx) * k,
    moveZ: (sy - sx) * k,
    jump: held.has("Space"),
  };
}
