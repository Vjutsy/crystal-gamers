import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import type { Scene } from "@babylonjs/core/scene";
import {
  type Booster,
  type Level,
  quatFromEulerDeg,
  type SolidStyle,
  type Spikes,
  type Spring,
  tuning,
} from "@cg/shared";

const STYLE_COLORS: Record<SolidStyle, string> = {
  grass: "#4fd27e",
  dirt: "#c9773a",
  block: "#ffd23f",
  ramp: "#ff9a3c",
  step: "#5aa9ff",
};

export function makeMaterial(scene: Scene, name: string, hex: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = new Color3(0.08, 0.08, 0.08);
  return m;
}

/** Builds meshes from the same level data the physics uses, so what you see is what you collide with. */
export function buildLevel(scene: Scene, level: Level, shadows: ShadowGenerator) {
  const mats = new Map<SolidStyle, StandardMaterial>();
  level.solids.forEach((s, i) => {
    let mat = mats.get(s.style);
    if (!mat) {
      mat = makeMaterial(scene, `lvl-${s.style}`, STYLE_COLORS[s.style]);
      mats.set(s.style, mat);
    }
    const box = CreateBox(`solid${i}`, { width: s.size.x, height: s.size.y, depth: s.size.z }, scene);
    box.position.set(s.pos.x, s.pos.y, s.pos.z);
    if (s.rot) {
      const q = quatFromEulerDeg(s.rot[0], s.rot[1], s.rot[2]);
      box.rotationQuaternion = new Quaternion(q.x, q.y, q.z, q.w);
    }
    box.material = mat;
    box.receiveShadows = true;
    if (s.style !== "grass") shadows.addShadowCaster(box);
    box.freezeWorldMatrix();
  });
  for (const [i, o] of (level.objects ?? []).entries()) {
    if (o.kind === "spring") buildSpring(scene, o, i, shadows);
    else if (o.kind === "booster") buildBooster(scene, o, i);
    else if (o.kind === "spikes") buildSpikes(scene, o, i, shadows);
  }
}

function buildSpring(scene: Scene, s: Spring, i: number, shadows: ShadowGenerator) {
  const r = tuning.objects.springRadius;
  const base = CreateCylinder(`spring${i}`, { diameter: r * 2, height: 0.25, tessellation: 20 }, scene);
  base.material = cachedMat(scene, "spring-base", "#e8323c");
  const top = CreateCylinder(`springTop${i}`, { diameter: r * 1.7, height: 0.1, tessellation: 20 }, scene);
  top.material = cachedMat(scene, "spring-top", "#ffe14d");
  top.parent = base;
  top.position.y = 0.17;
  base.position.set(s.pos.x, s.pos.y + 0.125, s.pos.z);
  // Diagonal springs lean towards where they throw.
  if (s.push) {
    base.rotation.z = -Math.atan2(s.push.x, s.power) * 0.6;
    base.rotation.x = Math.atan2(s.push.z, s.power) * 0.6;
  }
  shadows.addShadowCaster(base);
}

function buildBooster(scene: Scene, b: Booster, i: number) {
  const pad = CreateBox(`booster${i}`, { width: b.width, height: 0.04, depth: b.length }, scene);
  pad.material = cachedMat(scene, "booster", "#19c3ff");
  pad.position.set(b.pos.x, b.pos.y + 0.02, b.pos.z);
  pad.rotation.y = (b.yaw * Math.PI) / 180;
  pad.receiveShadows = true;
  // Two chevrons pointing forward.
  for (const k of [-0.3, 0.3]) {
    for (const side of [-1, 1]) {
      const bar = CreateBox(`chev${i}`, { width: b.width * 0.42, height: 0.03, depth: 0.16 }, scene);
      bar.material = cachedMat(scene, "chevron", "#ffffff");
      bar.parent = pad;
      bar.position.set(side * b.width * 0.15, 0.03, k * b.length);
      bar.rotation.y = side * (Math.PI / 4);
    }
  }
}

function buildSpikes(scene: Scene, s: Spikes, i: number, shadows: ShadowGenerator) {
  const plate = CreateBox(`spikes${i}`, { width: s.width, height: 0.08, depth: s.length }, scene);
  plate.material = cachedMat(scene, "spike-plate", "#5b5f6b");
  plate.position.set(s.pos.x, s.pos.y + 0.04, s.pos.z);
  plate.rotation.y = (s.yaw * Math.PI) / 180;
  plate.receiveShadows = true;
  const step = 0.5;
  for (let a = -s.width / 2 + step / 2; a < s.width / 2; a += step) {
    for (let b = -s.length / 2 + step / 2; b < s.length / 2; b += step) {
      const cone = CreateCylinder(
        `spike${i}`,
        { diameterTop: 0, diameterBottom: 0.28, height: 0.4, tessellation: 4 },
        scene,
      );
      cone.material = cachedMat(scene, "spike", "#d9dde6");
      cone.parent = plate;
      cone.position.set(a, 0.24, b);
      shadows.addShadowCaster(cone);
    }
  }
}

export interface CheckpointView {
  /** Respawn position this checkpoint sets (same rule as the shared game code). */
  respawn: { x: number; z: number };
  setActive(active: boolean): void;
}

/** Checkpoint posts: blue until touched, then the ball lights up yellow. */
export function buildCheckpoints(scene: Scene, level: Level, shadows: ShadowGenerator): CheckpointView[] {
  const idle = cachedMat(scene, "cp-idle", "#4a7dff");
  const lit = cachedMat(scene, "cp-lit", "#ffd23f");
  lit.emissiveColor = Color3.FromHexString("#806000");
  const views: CheckpointView[] = [];
  for (const [i, o] of (level.objects ?? []).entries()) {
    if (o.kind !== "checkpoint") continue;
    const pole = CreateCylinder(`cpPole${i}`, { diameter: 0.12, height: 1.6, tessellation: 8 }, scene);
    pole.material = cachedMat(scene, "cp-pole", "#e8e8f0");
    pole.position.set(o.pos.x, o.pos.y + 0.8, o.pos.z);
    shadows.addShadowCaster(pole);
    const ball = CreateSphere(`cpBall${i}`, { diameter: 0.45, segments: 10 }, scene);
    ball.material = idle;
    ball.parent = pole;
    ball.position.y = 0.9;
    views.push({
      respawn: { x: o.pos.x, z: o.pos.z },
      setActive: (active) => {
        ball.material = active ? lit : idle;
      },
    });
  }
  return views;
}

const matCache = new Map<string, StandardMaterial>();
function cachedMat(scene: Scene, name: string, hex: string) {
  let m = matCache.get(name);
  if (!m) {
    m = makeMaterial(scene, name, hex);
    matCache.set(name, m);
  }
  return m;
}
