import { type SchemaType, schema, t } from "@colyseus/schema";

/**
 * Everything a client needs about one hero: enough to draw it (others) and
 * to reconcile its own prediction (ADR-0003), i.e. the full MoverState plus game flags.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    /** 0..3, decides the colour. */
    slot: t.uint8(),
    connected: t.boolean(),
    /** Last input seq the server has applied for this player. */
    lastSeq: t.uint32(),
    x: t.number(),
    y: t.number(),
    z: t.number(),
    vx: t.number(),
    vy: t.number(),
    vz: t.number(),
    grounded: t.boolean(),
    coyote: t.number(),
    jumpBuffer: t.number(),
    jumpHeld: t.boolean(),
    jumpCuttable: t.boolean(),
    facingX: t.number(),
    facingZ: t.number(),
    spinCharge: t.number(),
    rolling: t.boolean(),
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
