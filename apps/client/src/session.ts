import {
  CorrectionSmoother,
  createGame,
  type GameState,
  type HeroState,
  type InputFrame,
  InputHistory,
  type Level,
  type MoverState,
  type PhysicsWorld,
  replayMover,
  SampleBuffer,
  SIM_DT,
  stepGame,
  stepMover,
  tuning,
  type Vec3,
} from "@cg/shared";
import type { HeroLook } from "./hero-view.ts";
import { tr } from "./i18n.ts";
import type { Net, Snapshot } from "./net.ts";

/** What the renderer needs for one frame, the same for solo and online play. */
export interface Frame {
  me: HeroLook;
  mySlot: number;
  myName: string | null;
  crystals: number;
  taken(id: number): boolean;
  scattered: { id: number; pos: Vec3; fading: boolean }[];
  checkpoint: Vec3;
  others: { id: string; name: string; slot: number; connected: boolean; look: HeroLook }[];
  /** New HUD status line, or null to keep the old one. */
  status: string | null;
}

export interface Session {
  /** One fixed simulation step with this input. */
  tick(input: InputFrame): void;
  /** `alpha` = how far we are between the last two ticks (0..1), `dt` = frame time, s. */
  frame(alpha: number, dt: number): Frame;
}

function lerp(a: Vec3, b: Vec3, k: number): Vec3 {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}

/** No server: the whole game runs here, exactly like the server would run it. */
export class SoloSession implements Session {
  private game: GameState;
  private prev: MoverState;
  private static readonly ME = "me";

  constructor(
    private world: PhysicsWorld,
    level: Level,
  ) {
    this.game = createGame(world, level, [SoloSession.ME]);
    this.prev = this.hero().mover;
  }

  private hero() {
    return this.game.heroes[SoloSession.ME] as HeroState;
  }

  tick(input: InputFrame) {
    this.prev = this.hero().mover;
    stepGame(this.world, this.game, { [SoloSession.ME]: input }, SIM_DT);
  }

  frame(alpha: number): Frame {
    const h = this.hero();
    const g = this.game;
    return {
      me: { ...h.mover, pos: lerp(this.prev.pos, h.mover.pos, alpha), downed: h.downed, invuln: h.invuln },
      mySlot: 0,
      myName: null,
      crystals: h.crystals,
      taken: (id) => g.crystals.find((c) => c.id === id)?.taken ?? false,
      scattered: g.scattered.map((c) => ({ id: c.id, pos: c.pos, fading: c.age > tuning.scatter.life - 1 })),
      checkpoint: g.checkpoint,
      others: [],
      status: null,
    };
  }
}

/** How far behind real time other heroes are drawn, ms (ADR-0003: ~2 patches). */
const INTERP_DELAY_MS = 100;

/**
 * Online: the server decides everything. Own hero is predicted locally and reconciled with
 * every snapshot; other heroes are interpolated between snapshots.
 */
export class NetSession implements Session {
  private body: number;
  private pred: MoverState | null = null;
  private prev: MoverState | null = null;
  private seq = 0;
  private history = new InputHistory();
  private smoother = new CorrectionSmoother();
  private buffers = new Map<string, SampleBuffer>();
  private snap: Snapshot | null = null;

  constructor(
    private world: PhysicsWorld,
    level: Level,
    private net: Net,
  ) {
    this.body = world.addCharacter(level.spawn);
  }

  private mine() {
    return this.snap?.players.get(this.net.sessionId) ?? null;
  }

  tick(input: InputFrame) {
    this.seq++;
    this.history.push({ seq: this.seq, input });
    this.net.send(this.seq, input);
    const me = this.mine();
    if (!this.pred || !this.snap || !me || me.downed > 0) return;
    this.prev = this.pred;
    this.pred = stepMover(this.world, this.body, this.pred, input, SIM_DT, this.snap.checkpoint);
  }

  private receive(s: Snapshot) {
    this.snap = s;
    const now = performance.now();
    for (const [id, p] of s.players) {
      if (id === this.net.sessionId) continue;
      let b = this.buffers.get(id);
      if (!b) {
        b = new SampleBuffer();
        this.buffers.set(id, b);
      }
      b.push({ t: now, pos: p.mover.pos });
    }
    for (const id of this.buffers.keys()) if (!s.players.has(id)) this.buffers.delete(id);

    const me = s.players.get(this.net.sessionId);
    if (!me) return;
    this.history.ack(me.lastSeq);
    if (me.downed > 0) {
      // Lying on the ground: nothing to predict, just show what the server says.
      this.pred = me.mover;
      this.prev = me.mover;
      this.smoother.offset = { x: 0, y: 0, z: 0 };
      return;
    }
    const corrected = replayMover(
      this.world,
      this.body,
      me.mover,
      this.history.pending(),
      SIM_DT,
      s.checkpoint,
    );
    if (this.pred && this.prev) {
      // Keep the picture continuous: the jump becomes an offset that fades out.
      this.smoother.correct(this.pred.pos, corrected.pos);
      const d = {
        x: corrected.pos.x - this.pred.pos.x,
        y: corrected.pos.y - this.pred.pos.y,
        z: corrected.pos.z - this.pred.pos.z,
      };
      this.prev = {
        ...this.prev,
        pos: { x: this.prev.pos.x + d.x, y: this.prev.pos.y + d.y, z: this.prev.pos.z + d.z },
      };
    } else {
      this.prev = corrected;
    }
    this.pred = corrected;
  }

  frame(alpha: number, dt: number): Frame {
    for (const s of this.net.takeSnapshots()) this.receive(s);
    this.smoother.decay(dt);

    const s = this.snap;
    const me = this.mine();
    const pred = this.pred;
    const pos = pred && this.prev ? lerp(this.prev.pos, pred.pos, alpha) : { x: 0, y: -100, z: 0 };
    const o = this.smoother.offset;
    const renderTime = performance.now() - INTERP_DELAY_MS;

    const others: Frame["others"] = [];
    if (s) {
      for (const [id, p] of s.players) {
        if (id === this.net.sessionId) continue;
        const at = this.buffers.get(id)?.sample(renderTime) ?? p.mover.pos;
        others.push({
          id,
          name: p.name,
          slot: p.slot,
          connected: p.connected,
          look: { ...p.mover, pos: at, downed: p.downed, invuln: p.invuln },
        });
      }
    }

    return {
      me: {
        pos: { x: pos.x + o.x, y: pos.y + o.y, z: pos.z + o.z },
        spinCharge: pred?.spinCharge ?? -1,
        rolling: pred?.rolling ?? false,
        downed: me?.downed ?? 0,
        invuln: me?.invuln ?? 0,
      },
      mySlot: me?.slot ?? 0,
      myName: me?.name ?? null,
      crystals: me?.crystals ?? 0,
      taken: (id) => s?.taken[id] ?? false,
      scattered: (s?.scattered ?? []).map((c) => ({ ...c, fading: false })),
      checkpoint: s?.checkpoint ?? { x: 0, y: 0, z: 0 },
      others,
      status: s ? tr.online(s.players.size, this.net.roomId, Math.round(this.net.pingMs())) : null,
    };
  }
}
