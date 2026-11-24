import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "./constants.ts";
import type { Rng } from "./rng.ts";

export function generateRoomCode(rng: Rng): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/** Normalises user input ("ab cd" → "ABCD") and returns null if it is not a valid code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) {
    if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  }
  return code;
}
