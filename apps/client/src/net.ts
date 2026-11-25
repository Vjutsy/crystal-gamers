import {
  DEFAULT_SERVER_PORT,
  GAME_ROOM,
  type InputFrame,
  type MoverState,
  normalizeRoomCode,
  type Vec3,
} from "@cg/shared";
import { Client, type Room } from "@colyseus/sdk";

/** Bad-network simulator (?lag=150&jitter=30&loss=2 in the URL, or the ?debug panel). Applied each way. */
export const netSim = {
  /** Round-trip delay to add, ms (half on send, half on receive). */
  lagMs: Number(new URLSearchParams(location.search).get("lag") ?? 0) || 0,
  /** Random extra delay per message, ms. */
  jitterMs: Number(new URLSearchParams(location.search).get("jitter") ?? 0) || 0,
  /** Share of server snapshots to throw away, % (like lost packets). */
  lossPct: Number(new URLSearchParams(location.search).get("loss") ?? 0) || 0,
};

export interface PlayerSnap {
  name: string;
  slot: number;
  connected: boolean;
  lastSeq: number;
  mover: MoverState;
  crystals: number;
  invuln: number;
  downed: number;
}

/** Plain copy of the server state at one moment (so it can be delayed and buffered). */
export interface Snapshot {
  tick: number;
  players: Map<string, PlayerSnap>;
  taken: boolean[];
  scattered: { id: number; pos: Vec3 }[];
  checkpoint: Vec3;
}

export interface Net {
  sessionId: string;
  roomId: string;
  send(seq: number, input: InputFrame): void;
  /** Snapshots that have "arrived" (after simulated delay), oldest first. Empties the queue. */
  takeSnapshots(): Snapshot[];
  /** Last measured round trip, ms (includes simulated lag). */
  pingMs(): number;
}

function serverUrl(): string | null {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;
  }
  return null; // no server configured for this deployment yet → solo mode
}

// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
function toSnapshot(state: any): Snapshot {
  const players = new Map<string, PlayerSnap>();
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  state.players?.forEach((p: any, id: string) => {
    players.set(id, {
      name: p.name,
      slot: p.slot,
      connected: p.connected,
      lastSeq: p.lastSeq,
      crystals: p.crystals,
      invuln: p.invuln,
      downed: p.downed,
      mover: {
        pos: { x: p.x, y: p.y, z: p.z },
        vel: { x: p.vx, y: p.vy, z: p.vz },
        grounded: p.grounded,
        coyote: p.coyote,
        jumpBuffer: p.jumpBuffer,
        jumpHeld: p.jumpHeld,
        jumpCuttable: p.jumpCuttable,
        facing: { x: p.facingX, z: p.facingZ },
        spinCharge: p.spinCharge,
        rolling: p.rolling,
      },
    });
  });
  const scattered: Snapshot["scattered"] = [];
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  state.scattered?.forEach((c: any, id: string) => {
    scattered.push({ id: Number(id), pos: { x: c.x, y: c.y, z: c.z } });
  });
  return {
    tick: state.tick,
    players,
    taken: [...(state.taken ?? [])],
    scattered,
    checkpoint: { x: state.cpX, y: state.cpY, z: state.cpZ },
  };
}

/** Delay (ms) for one direction of the simulated network; never earlier than the previous message. */
function makeDelayer() {
  let lastAt = 0;
  return () => {
    const at = Math.max(lastAt, performance.now() + netSim.lagMs / 2 + Math.random() * netSim.jitterMs);
    lastAt = at;
    return at - performance.now();
  };
}

/** Connects to a room, or resolves null so the game runs in solo mode. ?room=CODE joins that room. */
export async function connect(name?: string): Promise<Net | null> {
  const url = serverUrl();
  if (!url) return null;
  try {
    const client = new Client(url);
    const code = normalizeRoomCode(new URLSearchParams(location.search).get("room") ?? "");
    const opts = { name };
    const room: Room = await withTimeout(
      code ? client.joinById(code, opts) : client.joinOrCreate(GAME_ROOM, opts),
      4000,
    );

    const incoming: { at: number; snap: Snapshot }[] = [];
    const recvDelay = makeDelayer();
    const sendDelay = makeDelayer();
    room.onStateChange((state) => {
      if (Math.random() * 100 < netSim.lossPct) return;
      incoming.push({ at: performance.now() + recvDelay(), snap: toSnapshot(state) });
    });

    let ping = 0;
    const measure = () => {
      const t0 = performance.now();
      room.ping(() => {
        ping = performance.now() - t0 + netSim.lagMs;
      });
    };
    measure();
    setInterval(measure, 1000);

    return {
      sessionId: room.sessionId,
      roomId: room.roomId,
      send: (seq, input) => {
        const delay = sendDelay();
        if (delay <= 0) room.send("input", { seq, input });
        else setTimeout(() => room.send("input", { seq, input }), delay);
      },
      takeSnapshots: () => {
        const now = performance.now();
        const ready: Snapshot[] = [];
        while (incoming.length > 0 && (incoming[0]?.at ?? Number.POSITIVE_INFINITY) <= now) {
          const next = incoming.shift();
          if (next) ready.push(next.snap);
        }
        return ready;
      },
      pingMs: () => ping,
    };
  } catch (err) {
    console.warn("Server unavailable, running solo:", err);
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}
