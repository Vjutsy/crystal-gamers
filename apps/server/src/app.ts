import { GAME_ROOM } from "@cg/shared";
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom.ts";
import { tickStats } from "./tick-stats.ts";

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
      app.get(
        "/health",
        (_req: unknown, res: { json(body: unknown): void; set(k: string, v: string): void }) => {
          res.set("Access-Control-Allow-Origin", "*");
          res.json({ ok: true, game: "crystal-gamers", tick: tickStats.summary() });
        },
      );
    },
  });
}
