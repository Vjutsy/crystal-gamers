import { DEFAULT_SERVER_PORT, GAME_ROOM } from "@cg/shared";
import { defineRoom, defineServer } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { GameRoom } from "./GameRoom.ts";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);

export const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    [GAME_ROOM]: defineRoom(GameRoom),
  },
});

await server.listen(port);
console.log(`Crystal Gamers server: ws://localhost:${port}`);
