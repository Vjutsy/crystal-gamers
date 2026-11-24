import type { Vec3 } from "./math.ts";

export interface Crystal {
  id: number;
  pos: Vec3;
  taken: boolean;
}

export const CRYSTAL_PICKUP_RADIUS = 0.9;

/** Marks crystals within reach of `pos` as taken and returns the ids picked this tick. */
export function collectCrystals(pos: Vec3, crystals: Crystal[], radius = CRYSTAL_PICKUP_RADIUS): number[] {
  const picked: number[] = [];
  const r2 = radius * radius;
  for (const c of crystals) {
    if (c.taken) continue;
    const dx = c.pos.x - pos.x;
    const dz = c.pos.z - pos.z;
    if (dx * dx + dz * dz <= r2) {
      c.taken = true;
      picked.push(c.id);
    }
  }
  return picked;
}

/** Deterministic test layout: a ring of crystals around the spawn. */
export function ringOfCrystals(count: number, radius: number): Crystal[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { id: i, pos: { x: Math.cos(a) * radius, y: 0.8, z: Math.sin(a) * radius }, taken: false };
  });
}
