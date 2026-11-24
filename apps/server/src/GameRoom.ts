import {
  createMover,
  type InputFrame,
  initPhysics,
  MAX_PLAYERS,
  type MoverState,
  NO_INPUT,
  PhysicsWorld,
  SIM_DT,
  stepMover,
  testLevel,
} from "@cg/shared";
import { type Client, Room } from "@colyseus/core";
import { type SchemaType, schema, t } from "@colyseus/schema";

export const PlayerState = schema(
  {
    name: t.string(),
    x: t.number(),
    y: t.number(),
    z: t.number(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const GameState = schema(
  {
    players: t.map(PlayerState),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;

interface Seat {
  body: number;
  mover: MoverState;
  input: InputFrame;
}

/**
 * Authoritative room: runs the same shared movement code as the client.
 * Real netcode (prediction, reconciliation, room codes) arrives in Phase 2.
 */
export class GameRoom extends Room<{ state: GameState }> {
  override maxClients = MAX_PLAYERS;
  private seats = new Map<string, Seat>();
  private world!: PhysicsWorld;
  private readonly level = testLevel;

  override async onCreate() {
    await initPhysics();
    this.world = new PhysicsWorld(this.level);
    this.setState(new GameState());
    this.onMessage("input", (client, msg: unknown) => {
      const seat = this.seats.get(client.sessionId);
      if (seat) seat.input = sanitizeInput(msg);
    });
    this.setSimulationInterval(() => this.tick(), SIM_DT * 1000);
  }

  override onJoin(client: Client, options?: { name?: unknown }) {
    const index = this.seats.size;
    const spawn = { ...this.level.spawn, x: this.level.spawn.x + index * 1.5 };
    const mover = createMover(spawn);
    this.seats.set(client.sessionId, { body: this.world.addCharacter(spawn), mover, input: NO_INPUT });
    const p = new PlayerState();
    p.name = typeof options?.name === "string" ? options.name.slice(0, 16) : `Гравець ${index + 1}`;
    p.x = mover.pos.x;
    p.y = mover.pos.y;
    p.z = mover.pos.z;
    this.state.players.set(client.sessionId, p);
  }

  override onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    if (seat) this.world.removeCharacter(seat.body);
    this.seats.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  override onDispose() {
    this.world?.dispose();
  }

  private tick() {
    for (const [id, seat] of this.seats) {
      seat.mover = stepMover(this.world, seat.body, seat.mover, seat.input, SIM_DT, this.level.spawn);
      const p = this.state.players.get(id);
      if (!p) continue;
      p.x = seat.mover.pos.x;
      p.y = seat.mover.pos.y;
      p.z = seat.mover.pos.z;
    }
  }
}

/** Never trust the client: coerce whatever arrives into a valid InputFrame. */
export function sanitizeInput(msg: unknown): InputFrame {
  if (typeof msg !== "object" || msg === null) return NO_INPUT;
  const m = msg as Record<string, unknown>;
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return { moveX: num(m.moveX), moveZ: num(m.moveZ), jump: m.jump === true };
}
