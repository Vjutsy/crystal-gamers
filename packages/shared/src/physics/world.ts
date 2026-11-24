import RAPIER from "@dimforge/rapier3d-deterministic-compat";
import type { Level } from "../level/types.ts";
import { quatFromEulerDeg, type Vec3 } from "../math.ts";
import { tuning } from "../tuning.ts";

let ready: Promise<void> | null = null;

/** Loads the Rapier WASM module once. Await before creating a PhysicsWorld (client and server). */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

// Collision groups: high 16 bits = membership, low 16 bits = what it collides with.
const LEVEL = 0x0001;
const CHARACTER = 0x0002;
const LEVEL_GROUPS = (LEVEL << 16) | 0xffff;
/** Characters only collide with the level, never with each other (co-op: players pass through). */
const CHARACTER_GROUPS = (CHARACTER << 16) | LEVEL;

export interface MoveResult {
  /** Movement actually applied after collisions. */
  delta: Vec3;
  grounded: boolean;
  /** Outward normals of everything the character touched this move. */
  normals: Vec3[];
}

/**
 * Static level geometry + kinematic character capsules.
 * The world itself is never stepped during play: a character move is a pure function of
 * (level, position, desired delta), which keeps it deterministic and easy to replay.
 */
export class PhysicsWorld {
  private world: RAPIER.World;
  private controller: RAPIER.KinematicCharacterController;
  private characters = new Map<number, RAPIER.Collider>();
  private nextId = 1;

  constructor(level: Level) {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    for (const s of level.solids) {
      const q = s.rot ? quatFromEulerDeg(s.rot[0], s.rot[1], s.rot[2]) : { x: 0, y: 0, z: 0, w: 1 };
      const desc = RAPIER.ColliderDesc.cuboid(s.size.x / 2, s.size.y / 2, s.size.z / 2)
        .setTranslation(s.pos.x, s.pos.y, s.pos.z)
        .setRotation(q)
        .setCollisionGroups(LEVEL_GROUPS);
      this.world.createCollider(desc);
    }
    // One step builds the broad-phase acceleration structure for the static level.
    this.world.step();

    const c = tuning.capsule;
    this.controller = this.world.createCharacterController(c.skin);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((c.maxSlopeDeg * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((c.maxSlopeDeg * Math.PI) / 180);
    this.controller.enableAutostep(c.stepHeight, c.stepMinWidth, false);
    this.controller.enableSnapToGround(c.snapToGround);
    this.controller.setApplyImpulsesToDynamicBodies(false);
  }

  addCharacter(pos: Vec3): number {
    const c = tuning.capsule;
    const desc = RAPIER.ColliderDesc.capsule(c.halfHeight, c.radius)
      .setTranslation(pos.x, pos.y, pos.z)
      .setCollisionGroups(CHARACTER_GROUPS);
    const id = this.nextId++;
    this.characters.set(id, this.world.createCollider(desc));
    return id;
  }

  removeCharacter(id: number) {
    const col = this.characters.get(id);
    if (col) this.world.removeCollider(col, false);
    this.characters.delete(id);
  }

  /** Moves character `id` from `pos` by `desired`, sliding along and stepping over the level. */
  move(id: number, pos: Vec3, desired: Vec3): MoveResult {
    const col = this.mustGet(id);
    col.setTranslation(pos);
    this.controller.computeColliderMovement(col, desired, undefined, CHARACTER_GROUPS);
    const m = this.controller.computedMovement();
    const normals: Vec3[] = [];
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const hit = this.controller.computedCollision(i);
      if (hit) normals.push({ x: hit.normal1.x, y: hit.normal1.y, z: hit.normal1.z });
    }
    return { delta: { x: m.x, y: m.y, z: m.z }, grounded: this.controller.computedGrounded(), normals };
  }

  /** Surface normal directly under the character's feet, or null if nothing is within `reach`. */
  groundNormal(id: number, pos: Vec3, reach: number): Vec3 | null {
    const col = this.mustGet(id);
    const c = tuning.capsule;
    const feet = { x: pos.x, y: pos.y - c.halfHeight - c.radius + 0.05, z: pos.z };
    const ray = new RAPIER.Ray(feet, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRayAndGetNormal(ray, reach + 0.05, true, undefined, CHARACTER_GROUPS, col);
    return hit ? { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z } : null;
  }

  /** Height of the first level surface below `from` (within `maxDist`), or null. Used for the blob shadow. */
  surfaceBelow(from: Vec3, maxDist: number): number | null {
    const ray = new RAPIER.Ray(from, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, maxDist, true, undefined, CHARACTER_GROUPS);
    return hit ? from.y - hit.timeOfImpact : null;
  }

  dispose() {
    this.world.free();
  }

  private mustGet(id: number): RAPIER.Collider {
    const col = this.characters.get(id);
    if (!col) throw new Error(`Unknown character ${id}`);
    return col;
  }
}
