import { DEFAULT_SERVER_PORT, GAME_ROOM, type InputFrame } from "@cg/shared";
import { Client, type Room } from "@colyseus/sdk";

export interface RemotePlayer {
  name: string;
  x: number;
  y: number;
  z: number;
}

export interface Net {
  sessionId: string;
  players: () => Map<string, RemotePlayer>;
  sendInput: (input: InputFrame) => void;
}

function serverUrl(): string | null {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;
  }
  return null; // no server configured for this deployment yet → solo mode
}

/** Connects to the game room, or resolves null so the game runs in solo mode. */
export async function connect(): Promise<Net | null> {
  const url = serverUrl();
  if (!url) return null;
  try {
    const client = new Client(url);
    const room: Room = await withTimeout(client.joinOrCreate(GAME_ROOM, {}), 3000);
    return {
      sessionId: room.sessionId,
      players: () => {
        const out = new Map<string, RemotePlayer>();
        const players = (room.state as { players?: Map<string, RemotePlayer> }).players;
        players?.forEach((p, id) => {
          out.set(id, { name: p.name, x: p.x, y: p.y, z: p.z });
        });
        return out;
      },
      sendInput: (input) => room.send("input", input),
    };
  } catch (err) {
    console.warn("Server unavailable, running solo:", err);
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}
