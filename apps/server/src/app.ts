import { GAME_ROOM, normalizeRoomCode } from "@cg/shared";
import { defineRoom, defineServer, matchMaker } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom.ts";
import { tickStats } from "./tick-stats.ts";

/** The bits of an Express response we use (avoids a dependency on Express types). */
interface JsonRes {
  json(body: unknown): void;
  set(k: string, v: string): void;
  status(code: number): JsonRes;
}

/** Builds the game server (not listening yet), so tests can start it on any port. */
export function createGameServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      [GAME_ROOM]: defineRoom(GameRoom),
    },
    express: (app) => {
      // Hosting health check; also handy to wake a sleeping free instance.
      // Also reports how long simulation ticks take (budget ≈ 16.7 ms at 60 Hz).
      app.get("/health", (_req: unknown, res: JsonRes) => {
        res.set("Access-Control-Allow-Origin", "*");
        res.json({ ok: true, game: "crystal-gamers", tick: tickStats.summary() });
      });
      // Lobby: does the room exist, and which heroes are taken (and by whom)?
      app.get("/room/:code", async (req: { params: { code?: string } }, res: JsonRes) => {
        res.set("Access-Control-Allow-Origin", "*");
        const code = normalizeRoomCode(req.params.code ?? "");
        const room = code ? await matchMaker.getRoomById(code) : undefined;
        if (!room) return res.status(404).json({ exists: false });
        res.json({ exists: true, taken: room.metadata?.taken ?? [], full: room.clients >= room.maxClients });
      });
    },
  });
}
