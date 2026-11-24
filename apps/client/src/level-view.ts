import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { type Level, quatFromEulerDeg, type SolidStyle } from "@cg/shared";

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
}
