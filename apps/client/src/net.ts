import {
  DEFAULT_SERVER_PORT,
  GAME_ROOM,
  type HeroId,
  type InputFrame,
  isHeroId,
  type MoverState,
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
  hero: HeroId;
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

/** Public game server on Render Free (docs/deploy.md). VITE_SERVER_URL overrides it. */
const HOSTED_SERVER_URL = "wss://crystal-gamers-server.onrender.com";

export function serverUrl(): string | null {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `ws://${location.hostname}:${DEFAULT_SERVER_PORT}`;
  }
  return HOSTED_SERVER_URL;
}

// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
function toSnapshot(state: any): Snapshot {
  const players = new Map<string, PlayerSnap>();
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  state.players?.forEach((p: any, id: string) => {
    players.set(id, {
      name: p.name,
      slot: p.slot,
      hero: isHeroId(p.hero) ? p.hero : "rubfir",
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

export type JoinRequest = { mode: "create" } | { mode: "join"; code: string };

/** Why joining failed, for a human-readable message in the lobby. */
export type JoinError = "not-found" | "full" | "unreachable" | "hero-taken";

export class JoinFailed extends Error {
  constructor(readonly reason: JoinError) {
    super(reason);
  }
}

/**
 * Free hosting sleeps when idle and takes up to ~a minute to start. Pings /health until it
 * answers; calls `onSlow` once if that takes longer than a moment. Resolves false on timeout.
 */
export async function wakeServer(url: string, onSlow: () => void, timeoutMs = 90_000): Promise<boolean> {
  const health = `${httpBase(url)}/health`;
  const t0 = performance.now();
  const slowTimer = setTimeout(onSlow, 1500);
  try {
    while (performance.now() - t0 < timeoutMs) {
      try {
        // no-cors: we only need to know the server answered, not read the body.
        await withTimeout(fetch(health, { mode: "no-cors", cache: "no-store" }), 10_000);
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return false;
  } finally {
    clearTimeout(slowTimer);
  }
}

/** Creates a room or joins one by code. Throws JoinFailed. */
export async function connect(url: string, req: JoinRequest, name: string, hero: HeroId): Promise<Net> {
  const client = new Client(url);
  const opts = { name, hero };
  try {
    return wrap(
      await withTimeout(
        req.mode === "create" ? client.create(GAME_ROOM, opts) : client.joinById(req.code, opts),
        10_000,
      ),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/hero-taken/i.test(msg)) throw new JoinFailed("hero-taken");
    if (/not found/i.test(msg)) throw new JoinFailed("not-found");
    if (/locked|full|maxClients/i.test(msg)) throw new JoinFailed("full");
    throw new JoinFailed("unreachable");
  }
}

/** What the lobby needs to know about a room before joining it (GET /room/:code). */
export async function roomInfo(
  url: string,
  code: string,
): Promise<{ exists: false } | { exists: true; full: boolean; taken: { hero: string; name: string }[] }> {
  const res = await withTimeout(fetch(`${httpBase(url)}/room/${code}`, { cache: "no-store" }), 10_000);
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new JoinFailed("unreachable");
  return await res.json();
}

function httpBase(url: string): string {
  return url.replace(/^ws/, "http").replace(/\/$/, "");
}

/** Takes back our own seat (same hero, colour and crystals) after a reload or a closed tab. */
export async function reconnect(url: string, token: string): Promise<Net | null> {
  try {
    return wrap(await withTimeout(new Client(url).reconnect(token), 6000));
  } catch {
    return null; // seat already given up (more than 20 s) or the room is gone
  }
}

function wrap(room: Room): Net {
  const seat = { room: room.roomId, token: room.reconnectionToken };
  saveSeat(seat);
  // Keep the "last seen" time fresh so a later visit knows whether the seat can still be waiting.
  setInterval(() => saveSeat(seat), 2000);
  addEventListener("pagehide", () => saveSeat(seat));

  const incoming: { at: number; snap: Snapshot }[] = [];
  const recvDelay = makeDelayer();
  const sendDelay = makeDelayer();
  room.onStateChange((state) => {
    if (Math.random() * 100 < netSim.lossPct) return;
    incoming.push({ at: performance.now() + recvDelay(), snap: toSnapshot(state) });
  });

  let ping = 0;
  const measure = () =>
    room.ping((ms) => {
      ping = ms + netSim.lagMs;
    });
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
}

/** Our seat in a room, remembered across reloads (sessionStorage) and reopened links (localStorage). */
interface Seat {
  room: string;
  token: string;
}
const SEAT_KEY = "cg-seat";

function saveSeat(seat: Seat) {
  const value = JSON.stringify({ ...seat, at: Date.now() });
  try {
    sessionStorage.setItem(SEAT_KEY, value);
    localStorage.setItem(SEAT_KEY, value);
  } catch {
    // Storage unavailable: reconnecting just will not work.
  }
}

/** The seat for this room if it may still be held for us (the server keeps it RECONNECT_SECONDS). */
export function savedSeat(room: string, maxAgeMs = 20_000): Seat | null {
  for (const store of [() => sessionStorage, () => localStorage]) {
    try {
      const raw = store().getItem(SEAT_KEY);
      if (!raw) continue;
      const s = JSON.parse(raw) as Seat & { at: number };
      if (s.room === room && Date.now() - s.at < maxAgeMs && typeof s.token === "string") return s;
    } catch {
      // ignore junk
    }
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}
