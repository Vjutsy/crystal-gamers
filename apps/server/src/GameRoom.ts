import {
  addHero,
  createGame,
  type InputFrame,
  initPhysics,
  MAX_PLAYERS,
  PhysicsWorld,
  removeHero,
  type GameState as SharedGame,
  SIM_DT,
  sanitizeInput,
  stepGame,
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

/**
 * Authoritative room: runs the same shared game code (movement, crystals, hazards) as the client.
 * Real netcode (prediction, reconciliation, room codes) arrives in Phase 2.
 */
export class GameRoom extends Room<{ state: GameState }> {
  override maxClients = MAX_PLAYERS;
  private world!: PhysicsWorld;
  private game!: SharedGame;
  private playerInputs: Record<string, InputFrame> = {};
  private readonly level = testLevel;

  override async onCreate() {
    await initPhysics();
    this.world = new PhysicsWorld(this.level);
    this.game = createGame(this.world, this.level, []);
    this.setState(new GameState());
    this.onMessage("input", (client, msg: unknown) => {
      if (this.game.heroes[client.sessionId]) this.playerInputs[client.sessionId] = sanitizeInput(msg);
    });
    this.setSimulationInterval(() => this.tick(), SIM_DT * 1000);
  }

  override onJoin(client: Client, options?: { name?: unknown }) {
    const slot = Object.keys(this.game.heroes).length;
    const hero = addHero(this.world, this.game, client.sessionId, slot);
    const p = new PlayerState();
    p.name = typeof options?.name === "string" ? options.name.slice(0, 16) : `Гравець ${slot + 1}`;
    p.x = hero.mover.pos.x;
    p.y = hero.mover.pos.y;
    p.z = hero.mover.pos.z;
    this.state.players.set(client.sessionId, p);
  }

  override onLeave(client: Client) {
    removeHero(this.world, this.game, client.sessionId);
    delete this.playerInputs[client.sessionId];
    this.state.players.delete(client.sessionId);
  }

  override onDispose() {
    this.world?.dispose();
  }

  private tick() {
    stepGame(this.world, this.game, this.playerInputs, SIM_DT);
    for (const [id, hero] of Object.entries(this.game.heroes)) {
      const p = this.state.players.get(id);
      if (!p) continue;
      p.x = hero.mover.pos.x;
      p.y = hero.mover.pos.y;
      p.z = hero.mover.pos.z;
    }
  }
}
