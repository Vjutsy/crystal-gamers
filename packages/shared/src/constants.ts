/** Simulation runs at a fixed rate on both client and server. */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/** How often the server sends state patches to clients. */
export const PATCH_HZ = 20;

export const MAX_PLAYERS = 4;
export const GAME_ROOM = "game";
export const DEFAULT_SERVER_PORT = 2567;

/** Room codes avoid look-alike characters (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
