import { GAME_ROOM } from "@cg/shared";
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom.ts";

/** Builds the game server (not listening yet), so tests can start it on any port. */
export function createGameServer() {
  return defineServer({
    transport: new WebSocketTransport(),
    rooms: {
      [GAME_ROOM]: defineRoom(GameRoom),
    },
    express: (app) => {
      // Hosting health check; also handy to wake a sleeping free instance.
      app.get("/health", (_req: unknown, res: { json(body: unknown): void }) => {
        res.json({ ok: true, game: "crystal-gamers" });
      });
    },
  });
}
