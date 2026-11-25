/**
 * Load check (SPEC-0002 step 5): 4 bots play in one room for a while, then we read tick timing.
 *   pnpm --filter @cg/server bench                 → starts a local server
 *   pnpm --filter @cg/server bench wss://host      → loads a deployed server, reads its /health
 * Optional second argument: seconds (default 30).
 */
import { GAME_ROOM, type InputFrame, MAX_PLAYERS, SIM_DT } from "@cg/shared";
import { Client, type Room } from "@colyseus/sdk";

const target = process.argv[2];
const seconds = Number(process.argv[3] ?? 30);

let url = target;
let stop: (() => Promise<void>) | null = null;
if (!url) {
  const { createGameServer } = await import("./app.ts");
  const port = 27000 + Math.floor(Math.random() * 1000);
  const server = createGameServer();
  await server.listen(port);
  url = `ws://localhost:${port}`;
  stop = () => server.gracefullyShutdown(false);
}

const client = new Client(url);
const rooms: Room[] = [await client.create(GAME_ROOM, { name: "bot 1" })];
const first = rooms[0];
if (!first) throw new Error("no room");
for (let i = 1; i < MAX_PLAYERS; i++)
  rooms.push(await client.joinById(first.roomId, { name: `bot ${i + 1}` }));
console.log(`room ${first.roomId}: ${rooms.length} bots for ${seconds} s on ${url}`);

// Each bot runs in a slowly turning circle, jumps and spin-dashes now and then.
let frame = 0;
const seqs = rooms.map(() => 0);
const timer = setInterval(() => {
  frame++;
  rooms.forEach((room, i) => {
    const a = frame / 90 + i * 1.6;
    const input: InputFrame = {
      moveX: Math.cos(a),
      moveZ: Math.sin(a),
      jump: (frame + i * 20) % 80 < 10,
      spin: (frame + i * 50) % 300 < 30,
      interact: false,
    };
    seqs[i] = (seqs[i] ?? 0) + 1;
    room.send("input", { seq: seqs[i], input });
  });
}, SIM_DT * 1000);

await new Promise((r) => setTimeout(r, seconds * 1000));
clearInterval(timer);

const health = `${url.replace(/^ws/, "http")}/health`;
const report = (await (await fetch(health)).json()) as { tick: unknown };
console.log("tick timing (last ~10 s):", report.tick);
console.log("budget per tick: 16.7 ms (60 Hz). Keep p99 well under it.");

for (const r of rooms) await r.leave();
await stop?.();
process.exit(0);
