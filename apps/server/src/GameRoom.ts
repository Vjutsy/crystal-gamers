import {
  createPlayer,
  type InputFrame,
  MAX_PLAYERS,
  NO_INPUT,
  type PlayerSim,
  SIM_DT,
  stepPlayer,
} from "@cg/shared";
import { type SchemaType, schema, t } from "@colyseus/schema";
import { type Client, Room } from "colyseus";

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
  sim: PlayerSim;
  input: InputFrame;
}

/**
 * Phase 0 room: proves the pipeline client → input → shared sim on server → state → client.
 * Real netcode (prediction, reconciliation, room codes) arrives in Phase 2.
 */
export class GameRoom extends Room<{ state: GameState }> {
  override maxClients = MAX_PLAYERS;
  private seats = new Map<string, Seat>();

  override onCreate() {
    this.setState(new GameState());
    this.onMessage("input", (client, msg: unknown) => {
      const seat = this.seats.get(client.sessionId);
      if (seat) seat.input = sanitizeInput(msg);
    });
    this.setSimulationInterval(() => this.tick(), SIM_DT * 1000);
  }

  override onJoin(client: Client, options?: { name?: unknown }) {
    const index = this.seats.size;
    const sim = createPlayer({ x: index * 2 - 3, y: 0, z: 0 });
    this.seats.set(client.sessionId, { sim, input: NO_INPUT });
    const p = new PlayerState();
    p.name = typeof options?.name === "string" ? options.name.slice(0, 16) : `Гравець ${index + 1}`;
    p.x = sim.pos.x;
    p.y = sim.pos.y;
    p.z = sim.pos.z;
    this.state.players.set(client.sessionId, p);
  }

  override onLeave(client: Client) {
    this.seats.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private tick() {
    for (const [id, seat] of this.seats) {
      seat.sim = stepPlayer(seat.sim, seat.input);
      const p = this.state.players.get(id);
      if (!p) continue;
      p.x = seat.sim.pos.x;
      p.y = seat.sim.pos.y;
      p.z = seat.sim.pos.z;
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
