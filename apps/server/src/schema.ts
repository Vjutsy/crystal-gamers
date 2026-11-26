import { type SchemaType, schema, t } from "@colyseus/schema";

/**
 * Everything a client needs about one hero: enough to draw it (others) and
 * to reconcile its own prediction (ADR-0003), i.e. the full MoverState plus game flags.
 * Mover fields are float64: the client replays from them, and float32 rounding would make
 * every reconciliation a tiny correction instead of an exact match.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    /** 0..3, decides the colour. */
    slot: t.uint8(),
    /** HeroId: rubfir | nevetes | erl | emi (SPEC-0003). */
    hero: t.string(),
    connected: t.boolean(),
    /** Last input seq the server has applied for this player. */
    lastSeq: t.uint32(),
    x: t.float64(),
    y: t.float64(),
    z: t.float64(),
    vx: t.float64(),
    vy: t.float64(),
    vz: t.float64(),
    grounded: t.boolean(),
    coyote: t.float64(),
    jumpBuffer: t.float64(),
    jumpHeld: t.boolean(),
    jumpCuttable: t.boolean(),
    facingX: t.float64(),
    facingZ: t.float64(),
    spinCharge: t.float64(),
    rolling: t.boolean(),
    airUsed: t.boolean(),
    pounding: t.boolean(),
    pounded: t.boolean(),
    dash: t.float64(),
    crystals: t.uint16(),
    invuln: t.number(),
    downed: t.number(),
    interactHeld: t.boolean(),
  },
  "PlayerState",
);
export type PlayerState = SchemaType<typeof PlayerState>;

export const ScatteredState = schema({ x: t.number(), y: t.number(), z: t.number() }, "ScatteredState");
export type ScatteredState = SchemaType<typeof ScatteredState>;

export const GameState = schema(
  {
    /** Server tick counter. */
    tick: t.uint32(),
    players: t.map(PlayerState),
    /** taken[i] = level crystal i has been collected. */
    taken: t.array("boolean"),
    scattered: t.map(ScatteredState),
    cpX: t.number(),
    cpY: t.number(),
    cpZ: t.number(),
  },
  "GameState",
);
export type GameState = SchemaType<typeof GameState>;
