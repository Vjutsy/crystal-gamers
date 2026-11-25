import { GAME_ROOM, NO_INPUT, normalizeRoomCode } from "@cg/shared";
import { Client, type Room } from "@colyseus/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGameServer } from "./app.ts";

const PORT = 26000 + Math.floor(Math.random() * 1000);
const URL = `ws://localhost:${PORT}`;
let server: ReturnType<typeof createGameServer>;

beforeAll(async () => {
  server = createGameServer();
  await server.listen(PORT);
});

afterAll(async () => {
  await server.gracefullyShutdown(false);
});

async function waitFor(check: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}

// biome-ignore lint/suspicious/noExplicitAny: state is decoded dynamically by the SDK
type AnyRoom = Room<any, any>;
const players = (room: AnyRoom) => room.state?.players;
const me = (room: AnyRoom) => players(room)?.get(room.sessionId);

describe("game server", () => {
  it("answers the health check", async () => {
    const res = await fetch(`http://localhost:${PORT}/health`);
    expect(res.ok).toBe(true);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("creates a room with a shareable 4-letter code; 3 more join by code, a 5th is refused", async () => {
    const host = await new Client(URL).create(GAME_ROOM, { name: "Host" });
    expect(normalizeRoomCode(host.roomId)).toBe(host.roomId);

    const guests = await Promise.all(
      [1, 2, 3].map((i) => new Client(URL).joinById(host.roomId, { name: `Guest ${i}` })),
    );
    await waitFor(() => players(host)?.size === 4);
    const slots = [...players(host).values()].map((p: { slot: number }) => p.slot).sort();
    expect(slots).toEqual([0, 1, 2, 3]);

    await expect(new Client(URL).joinById(host.roomId, {})).rejects.toThrow();

    for (const r of [host, ...guests]) await r.leave();
  });

  it("applies numbered inputs, moves the hero and reports lastSeq", async () => {
    const room = await new Client(URL).create(GAME_ROOM, { name: "Runner" });
    await waitFor(() => me(room) !== undefined);
    const startZ: number = me(room).z;
    for (let seq = 1; seq <= 40; seq++) {
      room.send("input", { seq, input: { ...NO_INPUT, moveX: 0.7, moveZ: 0.7 } });
      await new Promise((r) => setTimeout(r, 16));
    }
    await waitFor(() => me(room)?.lastSeq === 40);
    expect(me(room).z).toBeGreaterThan(startZ + 1);
    await room.leave();
  });

  it("frees the seat on leave and gives the next player the lowest free slot", async () => {
    const a = await new Client(URL).create(GAME_ROOM, {});
    const b = await new Client(URL).joinById(a.roomId, {});
    await waitFor(() => players(a)?.size === 2);
    await a.leave();
    await waitFor(() => players(b)?.size === 1);
    const c = await new Client(URL).joinById(b.roomId, {});
    await waitFor(() => players(c)?.size === 2 && me(c) !== undefined);
    expect(me(c).slot).toBe(0);
    await b.leave();
    await c.leave();
  });

  it("keeps a dropped player's hero and lets them reconnect to the same seat", async () => {
    const host = await new Client(URL).create(GAME_ROOM, {});
    const guestClient = new Client(URL);
    const guest = await guestClient.joinById(host.roomId, {});
    const sessionId = guest.sessionId;
    const token = guest.reconnectionToken;
    await waitFor(() => players(host)?.size === 2);

    await guest.leave(false); // connection lost, not a real "leave"
    await waitFor(() => players(host)?.get(sessionId)?.connected === false);
    expect(players(host).size).toBe(2);

    const back = await guestClient.reconnect(token);
    expect(back.sessionId).toBe(sessionId);
    await waitFor(() => players(host)?.get(sessionId)?.connected === true);

    await back.leave();
    await host.leave();
  });
});
