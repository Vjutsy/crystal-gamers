import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { type Booster, type Level, quatFromEulerDeg, type SolidStyle, type Spring, tuning } from "@cg/shared";

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
    else buildBooster(scene, o, i);
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

const matCache = new Map<string, StandardMaterial>();
function cachedMat(scene: Scene, name: string, hex: string) {
  let m = matCache.get(name);
  if (!m) {
    m = makeMaterial(scene, name, hex);
    matCache.set(name, m);
  }
  return m;
}
