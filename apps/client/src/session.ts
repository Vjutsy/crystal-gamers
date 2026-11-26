import {
  CorrectionSmoother,
  centerAt,
  createGame,
  type GameState,
  type HeroId,
  type HeroState,
  heroTuning,
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
  /** Null until the server has told us who we are. */
  myHero: HeroId | null;
  me: HeroLook;
  myName: string | null;
  crystals: number;
  taken(id: number): boolean;
  scattered: { id: number; pos: Vec3; fading: boolean }[];
  checkpoint: Vec3;
  others: { id: string; name: string; hero: HeroId; connected: boolean; look: HeroLook }[];
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
    hero: HeroId,
  ) {
    this.game = createGame(world, level, [SoloSession.ME], [hero]);
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
      myHero: h.hero,
      me: { ...h.mover, pos: lerp(this.prev.pos, h.mover.pos, alpha), downed: h.downed, invuln: h.invuln },
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
  /** Our own hero's physics body, made once the server says which hero we are. */
  private body: { id: number; hero: HeroId } | null = null;
  private pred: MoverState | null = null;
  private prev: MoverState | null = null;
  private seq = 0;
  private history = new InputHistory();
  private smoother = new CorrectionSmoother();
  private buffers = new Map<string, SampleBuffer>();
  private snap: Snapshot | null = null;

  constructor(
    private world: PhysicsWorld,
    private net: Net,
  ) {}

  private bodyFor(hero: HeroId): number {
    if (this.body?.hero !== hero) {
      if (this.body) this.world.removeCharacter(this.body.id);
      this.body = { id: this.world.addCharacter({ x: 0, y: -100, z: 0 }, heroTuning(hero).capsule), hero };
    }
    return this.body.id;
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
    const t = heroTuning(me.hero);
    this.prev = this.pred;
    this.pred = stepMover(
      this.world,
      this.bodyFor(me.hero),
      this.pred,
      input,
      SIM_DT,
      centerAt(this.snap.checkpoint, t),
      t,
    );
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
    const t = heroTuning(me.hero);
    const corrected = replayMover(
      this.world,
      this.bodyFor(me.hero),
      me.mover,
      this.history.pending(),
      SIM_DT,
      centerAt(s.checkpoint, t),
      t,
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
          hero: p.hero,
          connected: p.connected,
          look: { ...p.mover, pos: at, downed: p.downed, invuln: p.invuln },
        });
      }
    }

    return {
      myHero: me?.hero ?? null,
      me: {
        pos: { x: pos.x + o.x, y: pos.y + o.y, z: pos.z + o.z },
        spinCharge: pred?.spinCharge ?? -1,
        rolling: pred?.rolling ?? false,
        downed: me?.downed ?? 0,
        invuln: me?.invuln ?? 0,
      },
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
