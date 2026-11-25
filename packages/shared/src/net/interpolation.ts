import type { Vec3 } from "../math.ts";

/** One received position of a remote hero, stamped with the local receive time (ms). */
export interface Sample {
  t: number;
  pos: Vec3;
}

/** Keeps a short history of samples for one remote hero. */
export class SampleBuffer {
  private samples: Sample[] = [];

  push(s: Sample) {
    const last = this.samples.at(-1);
    if (last && s.t <= last.t) return; // out of order or duplicate
    this.samples.push(s);
    if (this.samples.length > 30) this.samples.shift();
  }

  /**
   * Position at `renderTime` (ms), linearly interpolated between the two surrounding samples.
   * Before the first sample → first; after the last → last (no guessing ahead, ADR-0003).
   */
  sample(renderTime: number): Vec3 | null {
    const s = this.samples;
    const first = s[0];
    const last = s.at(-1);
    if (!first || !last) return null;
    if (renderTime <= first.t) return { ...first.pos };
    if (renderTime >= last.t) return { ...last.pos };
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1];
      const b = s[i];
      if (a && b && renderTime >= a.t) {
        const k = (renderTime - a.t) / (b.t - a.t);
        return {
          x: a.pos.x + (b.pos.x - a.pos.x) * k,
          y: a.pos.y + (b.pos.y - a.pos.y) * k,
          z: a.pos.z + (b.pos.z - a.pos.z) * k,
        };
      }
    }
    return { ...last.pos };
  }
}

/**
 * Visual smoothing of reconciliation corrections: instead of snapping the own hero to the
 * corrected position, the difference is shown as an offset that fades out.
 */
export class CorrectionSmoother {
  offset: Vec3 = { x: 0, y: 0, z: 0 };

  /** `before` = where the hero was shown, `after` = corrected prediction. Big jumps snap. */
  correct(before: Vec3, after: Vec3, snapDistance = 3) {
    const dx = before.x - after.x;
    const dy = before.y - after.y;
    const dz = before.z - after.z;
    if (Math.hypot(dx, dy, dz) > snapDistance) {
      this.offset = { x: 0, y: 0, z: 0 };
      return;
    }
    this.offset = { x: this.offset.x + dx, y: this.offset.y + dy, z: this.offset.z + dz };
  }

  /** Fades the offset with time constant `tau` seconds. */
  decay(dt: number, tau = 0.1) {
    const k = Math.exp(-dt / tau);
    this.offset = { x: this.offset.x * k, y: this.offset.y * k, z: this.offset.z * k };
  }
}
