import {
  addHero,
  createGame,
  type GameState as Game,
  generateRoomCode,
  type HeroState,
  type InputFrame,
  type InputMessage,
  initPhysics,
  MAX_PLAYERS,
  NO_INPUT,
  PATCH_HZ,
  PhysicsWorld,
  removeHero,
  SIM_DT,
  sanitizeInputMessage,
  stepGame,
  testLevel,
} from "@cg/shared";
import { type Client, Room } from "@colyseus/core";
import { GameState, PlayerState, ScatteredState } from "./schema.ts";

/** Seconds a dropped player keeps their hero and seat. */
export const RECONNECT_SECONDS = 20;
/** Inputs buffered per player; more than this means the client runs ahead, drop the oldest. */
const MAX_QUEUED_INPUTS = 8;

interface Seat {
  queue: InputMessage[];
  /** Last applied input, repeated when the queue runs dry (network hiccup). */
  last: InputFrame;
  lastSeq: number;
}

function cleanName(raw: unknown, slot: number): string {
  if (typeof raw !== "string") return `Гравець ${slot + 1}`;
  // Drop control characters (code points below 32), trim, cap the length.
  const name = [...raw]
    .filter((ch) => (ch.codePointAt(0) ?? 0) >= 32)
    .join("")
    .trim()
    .slice(0, 16);
  return name || `Гравець ${slot + 1}`;
}

/**
 * Authoritative co-op room (SPEC-0002, ADR-0003).
 * - The room id is a 4-letter code players share; join with joinById(code).
 * - Runs the shared stepGame at 60 Hz, sends state patches at PATCH_HZ.
 * - Applies one numbered input per player per tick and reports lastSeq back for reconciliation.
 * - A dropped player keeps their hero for RECONNECT_SECONDS.
 */
export class GameRoom extends Room<{ state: GameState }> {
  override maxClients = MAX_PLAYERS;
  private world!: PhysicsWorld;
  private game!: Game;
  private seats = new Map<string, Seat>();
  private readonly level = testLevel;

  override async onCreate() {
    this.roomId = generateRoomCode(Math.random);
    await initPhysics();
    this.world = new PhysicsWorld(this.level);
    this.game = createGame(this.world, this.level, []);
    const state = new GameState();
    for (let i = 0; i < this.game.crystals.length; i++) state.taken.push(false);
    this.setState(state);
    this.patchRate = 1000 / PATCH_HZ;

    this.onMessage("input", (client, msg: unknown) => {
      const seat = this.seats.get(client.sessionId);
      const m = sanitizeInputMessage(msg);
      if (!seat || !m || m.seq <= seat.lastSeq) return;
      seat.queue.push(m);
      if (seat.queue.length > MAX_QUEUED_INPUTS) seat.queue.shift();
    });
    this.setSimulationInterval(() => this.tick(), SIM_DT * 1000);
  }

  override onJoin(client: Client, options?: { name?: unknown }) {
    const used = new Set([...this.state.players.values()].map((p) => p.slot));
    const slot = [0, 1, 2, 3].find((s) => !used.has(s)) ?? 0;
    addHero(this.world, this.game, client.sessionId, slot);
    this.seats.set(client.sessionId, { queue: [], last: NO_INPUT, lastSeq: 0 });
    const p = new PlayerState();
    p.name = cleanName(options?.name, slot);
    p.slot = slot;
    p.connected = true;
    this.state.players.set(client.sessionId, p);
    this.writeHero(client.sessionId);
  }

  override async onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    const seat = this.seats.get(client.sessionId);
    if (seat) {
      seat.queue = [];
      seat.last = NO_INPUT;
    }
    await this.allowReconnection(client, RECONNECT_SECONDS);
  }

  override onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
  }

  override onLeave(client: Client) {
    removeHero(this.world, this.game, client.sessionId);
    this.seats.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  override onDispose() {
    this.world?.dispose();
  }

  private tick() {
    const inputs: Record<string, InputFrame> = {};
    for (const [id, seat] of this.seats) {
      const next = seat.queue.shift();
      if (next) {
        seat.last = next.input;
        seat.lastSeq = next.seq;
      }
      inputs[id] = seat.last;
    }
    stepGame(this.world, this.game, inputs, SIM_DT);
    this.state.tick++;
    for (const id of this.seats.keys()) this.writeHero(id);
    this.writeWorld();
  }

  private writeHero(id: string) {
    const h: HeroState | undefined = this.game.heroes[id];
    const p = this.state.players.get(id);
    if (!h || !p) return;
    const m = h.mover;
    p.lastSeq = this.seats.get(id)?.lastSeq ?? 0;
    p.x = m.pos.x;
    p.y = m.pos.y;
    p.z = m.pos.z;
    p.vx = m.vel.x;
    p.vy = m.vel.y;
    p.vz = m.vel.z;
    p.grounded = m.grounded;
    p.coyote = m.coyote;
    p.jumpBuffer = m.jumpBuffer;
    p.jumpHeld = m.jumpHeld;
    p.jumpCuttable = m.jumpCuttable;
    p.facingX = m.facing.x;
    p.facingZ = m.facing.z;
    p.spinCharge = m.spinCharge;
    p.rolling = m.rolling;
    p.crystals = h.crystals;
    p.invuln = h.invuln;
    p.downed = h.downed;
    p.interactHeld = h.interactHeld;
  }

  private writeWorld() {
    const s = this.state;
    this.game.crystals.forEach((c, i) => {
      if (s.taken[i] !== c.taken) s.taken[i] = c.taken;
    });
    const alive = new Set<string>();
    for (const c of this.game.scattered) {
      const key = String(c.id);
      alive.add(key);
      let v = s.scattered.get(key);
      if (!v) {
        v = new ScatteredState();
        s.scattered.set(key, v);
      }
      v.x = c.pos.x;
      v.y = c.pos.y;
      v.z = c.pos.z;
    }
    for (const key of [...s.scattered.keys()]) if (!alive.has(key)) s.scattered.delete(key);
    s.cpX = this.game.checkpoint.x;
    s.cpY = this.game.checkpoint.y;
    s.cpZ = this.game.checkpoint.z;
  }
}
