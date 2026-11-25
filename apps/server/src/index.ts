import { DEFAULT_SERVER_PORT } from "@cg/shared";
import { createGameServer } from "./app.ts";

const port = Number(process.env.PORT ?? DEFAULT_SERVER_PORT);
const server = createGameServer();
await server.listen(port);
console.log(`Crystal Gamers server: ws://localhost:${port}`);
